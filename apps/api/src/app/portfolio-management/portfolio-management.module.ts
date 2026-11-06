import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { PortfolioManagementModule as PortfolioManagementServiceModule } from '@ghostfolio/api/services/portfolio-management/portfolio-management.module';

import { Module } from '@nestjs/common';

import { PortfolioManagementController } from './portfolio-management.controller';

@Module({
  imports: [ConfigurationModule, PortfolioManagementServiceModule],
  controllers: [PortfolioManagementController]
})
export class PortfolioManagementModule {}
