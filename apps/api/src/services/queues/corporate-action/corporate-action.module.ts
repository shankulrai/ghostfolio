import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { CorporateActionModule } from '@ghostfolio/api/services/corporate-action/corporate-action.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';
import { CORPORATE_ACTION_QUEUE } from '@ghostfolio/common/config';

import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';

import { CorporateActionProcessor } from './corporate-action.processor';
import { CorporateActionService } from './corporate-action.service';

@Module({
  imports: [
    BullBoardModule.forFeature({
      adapter: BullAdapter,
      name: CORPORATE_ACTION_QUEUE,
      options: {
        displayName: 'Corporate Actions'
      }
    }),
    BullModule.registerQueue({
      name: CORPORATE_ACTION_QUEUE
    }),
    ConfigurationModule,
    CorporateActionModule,
    PrismaModule
  ],
  providers: [CorporateActionProcessor, CorporateActionService],
  exports: [BullModule, CorporateActionService]
})
export class CorporateActionQueueModule {}
