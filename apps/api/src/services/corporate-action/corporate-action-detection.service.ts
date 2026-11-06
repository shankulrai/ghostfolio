import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { CorporateActionAuditService } from '@ghostfolio/api/services/corporate-action/corporate-action-audit.service';
import { CorporateActionTelemetry } from '@ghostfolio/api/services/corporate-action/corporate-action-telemetry';
import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import type { CorporateActionsResult } from '@ghostfolio/api/services/data-provider/interfaces/data-provider.interface';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { CORPORATE_ACTION_LOOKBACK_DAYS } from '@ghostfolio/common/config';

import { Injectable, Logger } from '@nestjs/common';
import { CorporateActionEvent, DataSource } from '@prisma/client';
import { subDays } from 'date-fns';

interface DetectTarget {
  dataSource: DataSource;
  symbol: string;
}

@Injectable()
export class CorporateActionDetectionService {
  private readonly logger = new Logger(CorporateActionDetectionService.name);

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly corporateActionAuditService: CorporateActionAuditService,
    private readonly dataProviderService: DataProviderService,
    private readonly prismaService: PrismaService,
    private readonly telemetry: CorporateActionTelemetry
  ) {}

  public async getDetectTargets(): Promise<DetectTarget[]> {
    const enableFeature = this.configurationService.get(
      'ENABLE_FEATURE_CORPORATE_ACTIONS'
    );

    if (!enableFeature) {
      return [];
    }

    const profiles = await this.prismaService.symbolProfile.findMany({
      select: {
        dataSource: true,
        symbol: true
      },
      where: {
        activities: {
          some: {}
        },
        dataSource: DataSource.YAHOO,
        isActive: true
      }
    });

    return profiles.map((profile) => ({
      dataSource: profile.dataSource,
      symbol: profile.symbol
    }));
  }

  public async detectForSymbol({
    dataSource,
    symbol
  }: DetectTarget): Promise<CorporateActionEvent[]> {
    if (!this.configurationService.get('ENABLE_FEATURE_CORPORATE_ACTIONS')) {
      return [];
    }

    const symbolProfile = await this.prismaService.symbolProfile.findUnique({
      select: { id: true },
      where: {
        dataSource_symbol: {
          dataSource,
          symbol
        }
      }
    });

    if (!symbolProfile) {
      this.logger.warn(`Symbol profile not found: ${symbol}`);
      this.telemetry.emitDetectSymbolFailed({
        errorCode: 'profile_not_found',
        symbol
      });
      return [];
    }

    const to = new Date();
    const from = subDays(to, CORPORATE_ACTION_LOOKBACK_DAYS);

    let result: CorporateActionsResult;
    try {
      result = await this.dataProviderService.getCorporateActions({
        dataSource,
        from,
        symbol,
        to
      });
    } catch (error) {
      this.logger.error(`Failed to fetch corporate actions for ${symbol}`);
      this.telemetry.emitDetectSymbolFailed({
        errorCode: 'provider_error',
        symbol
      });
      return [];
    }

    const { dividends, mergers, splits } = result;

    const createdEvents: CorporateActionEvent[] = [];

    for (const split of splits) {
      if (split.date < from) {
        continue;
      }

      const { alreadyExists, event } =
        await this.corporateActionAuditService.insertPending({
          dataSource,
          denominator: split.denominator,
          effectiveDate: split.date,
          numerator: split.numerator,
          symbol,
          symbolProfileId: symbolProfile.id,
          type: 'SPLIT'
        });

      if (event) {
        createdEvents.push(event);
      } else if (alreadyExists) {
        await this.corporateActionAuditService.flagRevisedEvent({
          dataSource,
          denominator: split.denominator,
          effectiveDate: split.date,
          numerator: split.numerator,
          symbol,
          type: 'SPLIT'
        });
      }
    }

    for (const dividend of dividends) {
      if (dividend.date < from) {
        continue;
      }

      const { alreadyExists, event } =
        await this.corporateActionAuditService.insertPending({
          amountPerShare: dividend.amountPerShare,
          dataSource,
          effectiveDate: dividend.date,
          symbol,
          symbolProfileId: symbolProfile.id,
          type: 'DIVIDEND'
        });

      if (event) {
        createdEvents.push(event);
      } else if (alreadyExists) {
        await this.corporateActionAuditService.flagRevisedEvent({
          amountPerShare: dividend.amountPerShare,
          dataSource,
          effectiveDate: dividend.date,
          symbol,
          type: 'DIVIDEND'
        });
      }
    }

    for (const merger of mergers) {
      if (merger.date < from) {
        continue;
      }

      const { event } = await this.corporateActionAuditService.insertPending({
        dataSource,
        effectiveDate: merger.date,
        newSymbol: merger.newSymbol,
        symbol,
        symbolProfileId: symbolProfile.id,
        type: 'MERGER'
      });

      if (event) {
        createdEvents.push(event);
      }
    }

    this.telemetry.emitDetectSymbolCompleted({
      eventsDetected: createdEvents.length,
      symbol
    });

    return createdEvents;
  }
}
