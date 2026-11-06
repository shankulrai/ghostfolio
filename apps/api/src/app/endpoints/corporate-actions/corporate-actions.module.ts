import { CorporateActionAuditService } from '@ghostfolio/api/services/corporate-action/corporate-action-audit.service';
import { ImpersonationModule } from '@ghostfolio/api/services/impersonation/impersonation.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';

import { Module } from '@nestjs/common';

import { CorporateActionsController } from './corporate-actions.controller';

@Module({
  controllers: [CorporateActionsController],
  imports: [ImpersonationModule, PrismaModule],
  providers: [CorporateActionAuditService]
})
export class CorporateActionsModule {}
