import { HasPermission } from '@ghostfolio/api/decorators/has-permission.decorator';
import { Impersonation } from '@ghostfolio/api/decorators/impersonation.decorator';
import { HasPermissionGuard } from '@ghostfolio/api/guards/has-permission.guard';
import { ImpersonationGuard } from '@ghostfolio/api/guards/impersonation.guard';
import { CorporateActionAuditService } from '@ghostfolio/api/services/corporate-action/corporate-action-audit.service';
import type { CorporateActionsResponse } from '@ghostfolio/common/interfaces';
import { permissions } from '@ghostfolio/common/permissions';
import type { ImpersonationContext } from '@ghostfolio/common/types';

import {
  Controller,
  Get,
  InternalServerErrorException,
  Query,
  UseGuards
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

class GetCorporateActionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number = 50;
}

@Controller('corporate-actions')
@UseGuards(AuthGuard('jwt'), HasPermissionGuard)
export class CorporateActionsController {
  public constructor(
    private readonly corporateActionAuditService: CorporateActionAuditService
  ) {}

  @UseGuards(ImpersonationGuard)
  @Get()
  public async getCorporateActions(
    @Impersonation() { userId }: ImpersonationContext,
    @Query() { skip = 0, take = 50 }: GetCorporateActionsDto
  ): Promise<CorporateActionsResponse> {
    const { entries, total } =
      await this.corporateActionAuditService.getUserEntries({
        skip,
        take,
        userId
      });

    return { entries, skip, take, total };
  }

  @HasPermission(permissions.accessAdminControl)
  @Get('admin')
  public async getAdminCorporateActions(
    @Query() { skip = 0, take = 50 }: GetCorporateActionsDto
  ): Promise<CorporateActionsResponse> {
    let entries: CorporateActionsResponse['entries'];
    let total: number;
    let failedResult: { total: number };
    let stalePendingCount: number;

    try {
      [{ entries, total }, failedResult, stalePendingCount] = await Promise.all(
        [
          this.corporateActionAuditService.getAdminEntries({
            skip,
            take
          }),
          this.corporateActionAuditService.getAdminEntries({
            skip: 0,
            status: 'FAILED',
            take: 1
          }),
          this.corporateActionAuditService.getStalePendingCount()
        ]
      );
    } catch {
      throw new InternalServerErrorException(
        'Corporate actions could not be loaded'
      );
    }

    return {
      entries,
      failedCount: failedResult.total,
      skip,
      stalePendingCount,
      take,
      total
    };
  }
}
