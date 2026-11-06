import { AssetProfilesModule } from '@ghostfolio/api/app/endpoints/asset-profiles/asset-profiles.module';
import { ActivitiesModule } from '@ghostfolio/api/services/activities/activities.module';
import { AssetProfileSplitModule } from '@ghostfolio/api/services/asset-profile-split/asset-profile-split.module';
import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { DataProviderModule } from '@ghostfolio/api/services/data-provider/data-provider.module';
import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';

import { Module } from '@nestjs/common';

import { CorporateActionApplyService } from './corporate-action-apply.service';
import { CorporateActionAuditService } from './corporate-action-audit.service';
import { CorporateActionDetectionService } from './corporate-action-detection.service';
import { CorporateActionTelemetry } from './corporate-action-telemetry';

@Module({
  imports: [
    ActivitiesModule,
    AssetProfileSplitModule,
    AssetProfilesModule,
    ConfigurationModule,
    DataProviderModule,
    PrismaModule
  ],
  providers: [
    CorporateActionApplyService,
    CorporateActionAuditService,
    CorporateActionDetectionService,
    CorporateActionTelemetry
  ],
  exports: [
    CorporateActionApplyService,
    CorporateActionAuditService,
    CorporateActionDetectionService,
    CorporateActionTelemetry
  ]
})
export class CorporateActionModule {}
