import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { CorporateActionApplyService } from '@ghostfolio/api/services/corporate-action/corporate-action-apply.service';
import { CorporateActionAuditService } from '@ghostfolio/api/services/corporate-action/corporate-action-audit.service';
import { CorporateActionDetectionService } from '@ghostfolio/api/services/corporate-action/corporate-action-detection.service';
import { CorporateActionTelemetry } from '@ghostfolio/api/services/corporate-action/corporate-action-telemetry';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import {
  CORPORATE_ACTION_APPLY_JOB_NAME,
  CORPORATE_ACTION_DETECT_JOB_NAME,
  CORPORATE_ACTION_QUEUE
} from '@ghostfolio/common/config';
import { DataSource } from '@ghostfolio/prisma/enums';

import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { CorporateActionEvent } from '@prisma/client';
import { Job } from 'bull';

import { CorporateActionService } from './corporate-action.service';

interface DetectJobData {
  dataSource: DataSource;
  symbol: string;
}

interface ApplyJobData {
  eventId: string;
}

@Injectable()
@Processor(CORPORATE_ACTION_QUEUE)
export class CorporateActionProcessor {
  private readonly logger = new Logger(CorporateActionProcessor.name);

  public constructor(
    private readonly applyService: CorporateActionApplyService,
    private readonly auditService: CorporateActionAuditService,
    private readonly configurationService: ConfigurationService,
    private readonly corporateActionService: CorporateActionService,
    private readonly detectionService: CorporateActionDetectionService,
    private readonly prismaService: PrismaService,
    private readonly telemetry: CorporateActionTelemetry
  ) {}

  @Process({
    concurrency: 5,
    name: CORPORATE_ACTION_DETECT_JOB_NAME
  })
  public async detect(job: Job<DetectJobData>) {
    const { dataSource, symbol } = job.data;

    try {
      this.logger.log(
        `Corporate action detection started for ${symbol} (${dataSource})`
      );

      const events = await this.detectionService.detectForSymbol({
        dataSource,
        symbol
      });

      for (const event of events) {
        await this.corporateActionService.enqueueApply({ eventId: event.id });
      }

      this.logger.log(
        `Corporate action detection completed for ${symbol} (${dataSource})`
      );
    } catch (error) {
      this.logger.error(
        `Corporate action detection failed for ${symbol} (${dataSource}): ${error.name}`
      );

      throw error;
    }
  }

  @Process({
    concurrency: 3,
    name: CORPORATE_ACTION_APPLY_JOB_NAME
  })
  public async apply(job: Job<ApplyJobData>) {
    const { eventId } = job.data;
    let event: CorporateActionEvent | null = null;

    try {
      if (!this.configurationService.get('ENABLE_FEATURE_CORPORATE_ACTIONS')) {
        return;
      }

      this.logger.log(`Corporate action apply started for event ${eventId}`);

      event = await this.prismaService.corporateActionEvent.findUnique({
        where: { id: eventId }
      });

      if (!event) {
        this.logger.error(`Event ${eventId} not found`);
        return job.discard();
      }

      const result = await this.applyService.applyEvent(event);

      await this.auditService.transitionStatus({
        appliedCount: result.appliedCount,
        eventId,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        status: result.status
      });

      this.logger.log(`Corporate action apply completed for event ${eventId}`);
    } catch (error) {
      this.logger.error(
        `Corporate action apply failed for event ${eventId}: ${error.name}`
      );

      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        this.logger.warn(
          `Corporate action apply exhausted retries for event ${eventId}, marking as FAILED`
        );

        try {
          await this.auditService.transitionStatus({
            eventId,
            status: 'FAILED',
            failureReason: 'MAX_RETRIES'
          });

          if (event) {
            this.telemetry.emitApplyFailed({
              eventId,
              symbol: event.symbol,
              type: event.type,
              errorCode: 'MAX_RETRIES'
            });
          }
        } catch (markError) {
          this.logger.error(
            `Failed to mark event ${eventId} as FAILED: ${markError.name}`
          );
        }

        return job.discard();
      }

      throw error;
    }
  }
}
