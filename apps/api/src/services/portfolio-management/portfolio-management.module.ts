import { PrismaModule } from '@ghostfolio/api/services/prisma/prisma.module';

import { Module } from '@nestjs/common';

import { PortfolioManagementService } from './portfolio-management.service';

@Module({
  imports: [PrismaModule],
  providers: [PortfolioManagementService],
  exports: [PortfolioManagementService]
})
export class PortfolioManagementModule {}
