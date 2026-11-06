import { AssetProfilesService } from '@ghostfolio/api/app/endpoints/asset-profiles/asset-profiles.service';
import { ActivitiesService } from '@ghostfolio/api/services/activities/activities.service';
import { AssetProfileSplitService } from '@ghostfolio/api/services/asset-profile-split/asset-profile-split.service';
import { CorporateActionTelemetry } from '@ghostfolio/api/services/corporate-action/corporate-action-telemetry';
import {
  calculateExDateBasisQuantity,
  convertDividendAmount,
  isDividendWithinProximity
} from '@ghostfolio/api/services/corporate-action/corporate-action.helper';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import {
  CORPORATE_ACTION_APPLY_BATCH_SIZE,
  CORPORATE_ACTION_DIVIDEND_PROXIMITY_DAYS
} from '@ghostfolio/common/config';

import { Injectable } from '@nestjs/common';
import { CorporateActionEvent } from '@prisma/client';
import { addDays, isBefore, subDays } from 'date-fns';

interface ApplyResult {
  appliedCount: number;
  failedCount: number;
  skippedCount: number;
  status: string;
}

@Injectable()
export class CorporateActionApplyService {
  public constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly assetProfileSplitService: AssetProfileSplitService,
    private readonly assetProfilesService: AssetProfilesService,
    private readonly prismaService: PrismaService,
    private readonly telemetry: CorporateActionTelemetry
  ) {}

  public async applyEvent(event: CorporateActionEvent): Promise<ApplyResult> {
    const startTime = performance.now();

    this.telemetry.emitApplyStarted({
      eventId: event.id,
      symbol: event.symbol,
      type: event.type
    });

    let result: ApplyResult;

    if (event.type === 'SPLIT' || event.type === 'REVERSE_SPLIT') {
      result = await this.applySplit(event);
    } else if (event.type === 'DIVIDEND') {
      result = await this.applyDividend(event);
    } else if (event.type === 'MERGER') {
      result = await this.applyMerger(event);
    } else {
      result = {
        appliedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        status: 'FLAGGED_MANUAL'
      };
    }

    const durationMs = Math.round(performance.now() - startTime);

    this.telemetry.emitApplyCompleted({
      appliedCount: result.appliedCount,
      durationMs,
      eventId: event.id,
      failedCount: result.failedCount,
      skippedCount: result.skippedCount,
      status: result.status,
      symbol: event.symbol,
      type: event.type
    });

    return result;
  }

  private async applySplit(event: CorporateActionEvent): Promise<ApplyResult> {
    const { conflict } = await this.assetProfileSplitService.createIfAbsent({
      date: event.effectiveDate,
      denominator: event.denominator,
      numerator: event.numerator,
      symbolProfileId: event.symbolProfileId
    });

    if (conflict) {
      return {
        appliedCount: 0,
        failedCount: 0,
        skippedCount: 1,
        status: 'SKIPPED_CONFLICT'
      };
    }

    await this.assetProfilesService.gatherSymbolAndEmitPortfolioChangedEvents({
      dataSource: event.dataSource,
      force: true,
      symbol: event.symbol,
      symbolProfileId: event.symbolProfileId
    });

    this.telemetry.emitRecomputeRequested({
      eventId: event.id,
      symbol: event.symbol
    });

    return {
      appliedCount: 1,
      failedCount: 0,
      skippedCount: 0,
      status: 'APPLIED'
    };
  }

  private async applyDividend(
    event: CorporateActionEvent
  ): Promise<ApplyResult> {
    const holderIds = await this.activitiesService.getUserIdsBySymbolProfileId(
      event.symbolProfileId
    );

    if (holderIds.length === 0) {
      return {
        appliedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        status: 'APPLIED'
      };
    }

    const splits = await this.assetProfileSplitService.getSplits({
      dataSource: event.dataSource,
      symbol: event.symbol
    });

    const laterSplits = splits.filter((split) =>
      isBefore(event.effectiveDate, split.date)
    );

    const adjustedAmountPerShare = convertDividendAmount({
      amountPerShare: event.amountPerShare,
      laterSplits
    });

    let appliedCount = 0;
    let skippedCount = 0;
    let conflictCount = 0;
    let failedCount = 0;

    for (
      let i = 0;
      i < holderIds.length;
      i += CORPORATE_ACTION_APPLY_BATCH_SIZE
    ) {
      const batch = holderIds.slice(i, i + CORPORATE_ACTION_APPLY_BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map((userId) =>
          this.applyDividendForUser({
            adjustedAmountPerShare,
            event,
            splits,
            userId
          })
        )
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value === 'applied') {
            appliedCount++;
          } else if (result.value === 'conflict') {
            skippedCount++;
            conflictCount++;
          } else if (result.value === 'skipped') {
            skippedCount++;
          }
        } else {
          failedCount++;
        }
      }
    }

    if (appliedCount > 0) {
      return {
        appliedCount,
        failedCount,
        skippedCount,
        status: 'APPLIED'
      };
    }

    if (conflictCount > 0) {
      return {
        appliedCount: 0,
        failedCount,
        skippedCount,
        status: 'SKIPPED_CONFLICT'
      };
    }

    if (skippedCount > 0) {
      return {
        appliedCount: 0,
        failedCount,
        skippedCount,
        status: 'APPLIED'
      };
    }

    return {
      appliedCount: 0,
      failedCount,
      skippedCount: 0,
      status: 'FAILED'
    };
  }

  private async applyDividendForUser({
    adjustedAmountPerShare,
    event,
    splits,
    userId
  }: {
    adjustedAmountPerShare: number;
    event: CorporateActionEvent;
    splits: { date: Date; denominator: number; numerator: number }[];
    userId: string;
  }): Promise<'applied' | 'conflict' | 'skipped'> {
    const proximityStart = subDays(
      event.effectiveDate,
      CORPORATE_ACTION_DIVIDEND_PROXIMITY_DAYS
    );
    const proximityEnd = addDays(
      event.effectiveDate,
      CORPORATE_ACTION_DIVIDEND_PROXIMITY_DAYS
    );

    const existingDividends = await this.prismaService.order.findMany({
      where: {
        date: {
          gte: proximityStart,
          lte: proximityEnd
        },
        symbolProfileId: event.symbolProfileId,
        type: 'DIVIDEND',
        userId
      }
    });

    if (
      isDividendWithinProximity({
        candidateDate: event.effectiveDate,
        existingDividends: existingDividends.map((d) => ({ date: d.date })),
        proximityDays: CORPORATE_ACTION_DIVIDEND_PROXIMITY_DAYS
      })
    ) {
      return 'conflict';
    }

    const orders = await this.prismaService.order.findMany({
      orderBy: { date: 'asc' },
      select: { date: true, quantity: true, type: true },
      where: {
        symbolProfileId: event.symbolProfileId,
        type: {
          in: ['BUY', 'SELL']
        },
        userId
      }
    });

    const exDateBasisQuantity = calculateExDateBasisQuantity({
      exDate: event.effectiveDate,
      orders: orders.map((o) => ({
        date: o.date,
        quantity: o.quantity,
        type: o.type
      })),
      splits
    });

    if (exDateBasisQuantity <= 0) {
      return 'skipped';
    }

    const mostRecentActivity = await this.prismaService.order.findFirst({
      orderBy: { date: 'desc' },
      select: { accountId: true },
      where: {
        accountId: { not: null },
        date: { lt: event.effectiveDate },
        symbolProfileId: event.symbolProfileId,
        userId
      }
    });

    await this.activitiesService.createActivity({
      SymbolProfile: {
        connectOrCreate: {
          create: {
            currency: 'USD',
            dataSource: event.dataSource,
            symbol: event.symbol
          },
          where: {
            dataSource_symbol: {
              dataSource: event.dataSource,
              symbol: event.symbol
            }
          }
        }
      },
      accountId: mostRecentActivity?.accountId ?? undefined,
      comment: `Auto-created by corporate action ${event.id}`,
      currency: 'USD',
      date: event.effectiveDate,
      fee: 0,
      quantity: exDateBasisQuantity,
      symbol: event.symbol,
      type: 'DIVIDEND',
      unitPrice: adjustedAmountPerShare,
      updateAccountBalance: !!mostRecentActivity?.accountId,
      user: { connect: { id: userId } },
      userId
    });

    return 'applied';
  }

  private async applyMerger(event: CorporateActionEvent): Promise<ApplyResult> {
    if (!event.newSymbol) {
      return {
        appliedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        status: 'FLAGGED_MANUAL'
      };
    }

    return {
      appliedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      status: 'FLAGGED_MANUAL'
    };
  }
}
