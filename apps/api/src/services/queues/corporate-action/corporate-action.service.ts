import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import {
  CORPORATE_ACTION_APPLY_JOB_NAME,
  CORPORATE_ACTION_DETECT_JOB_NAME,
  CORPORATE_ACTION_DETECT_STAGGER_MS,
  CORPORATE_ACTION_JOB_OPTIONS,
  CORPORATE_ACTION_QUEUE
} from '@ghostfolio/common/config';

import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import { DataSource } from '@prisma/client';
import { Job, Queue } from 'bull';

interface EnqueueApplyParams {
  eventId: string;
}

@Injectable()
export class CorporateActionService {
  public constructor(
    @InjectQueue(CORPORATE_ACTION_QUEUE)
    private readonly corporateActionQueue: Queue,
    private readonly configurationService: ConfigurationService
  ) {}

  public async enqueueDetectBatch(
    targets: { dataSource: DataSource; symbol: string }[]
  ): Promise<Job[]> {
    if (!this.configurationService.get('ENABLE_FEATURE_CORPORATE_ACTIONS')) {
      return [];
    }

    const date = new Date().toISOString().split('T')[0];
    const jobs = targets.map(({ dataSource, symbol }, index) => ({
      data: { dataSource, symbol },
      name: CORPORATE_ACTION_DETECT_JOB_NAME,
      opts: {
        ...CORPORATE_ACTION_JOB_OPTIONS,
        delay: index * CORPORATE_ACTION_DETECT_STAGGER_MS,
        jobId: `corporate-action-detect:${dataSource}:${symbol}:${date}`
      }
    }));

    return this.corporateActionQueue.addBulk(jobs);
  }

  public async enqueueApply({
    eventId
  }: EnqueueApplyParams): Promise<Job | null> {
    if (!this.configurationService.get('ENABLE_FEATURE_CORPORATE_ACTIONS')) {
      return null;
    }

    return this.corporateActionQueue.add(
      CORPORATE_ACTION_APPLY_JOB_NAME,
      { eventId },
      {
        ...CORPORATE_ACTION_JOB_OPTIONS,
        jobId: eventId
      }
    );
  }
}
