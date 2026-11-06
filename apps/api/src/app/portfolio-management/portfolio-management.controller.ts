import { MultiCurrencyFeatureGuard } from '@ghostfolio/api/guards/multi-currency-feature.guard';
import { PortfolioManagementService } from '@ghostfolio/api/services/portfolio-management/portfolio-management.service';
import { SUPPORTED_BASE_CURRENCIES } from '@ghostfolio/common/config';
import type { RequestWithUser } from '@ghostfolio/common/types';

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  UseGuards
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Portfolio } from '@prisma/client';

import {
  CreatePortfolioDto,
  UpdateBaseCurrencyDto
} from './portfolio-management.dto';

/**
 * CRUD API endpoints for portfolio management.
 * REQ-001: Portfolio entity with base currency preference
 * REQ-009: Default portfolio creation on user signup
 */
@Controller('portfolio-management')
@UseGuards(AuthGuard('jwt'), MultiCurrencyFeatureGuard)
export class PortfolioManagementController {
  public constructor(
    private readonly portfolioManagementService: PortfolioManagementService,
    @Inject(REQUEST) private readonly request: RequestWithUser
  ) {}

  /**
   * GET /portfolio-management
   * List the authenticated user's portfolios.
   * REQ-001, AC-001
   */
  @Get()
  public async getPortfolios(): Promise<Portfolio[]> {
    return this.portfolioManagementService.getPortfoliosByUser(
      this.request.user.id
    );
  }

  /**
   * POST /portfolio-management
   * Create a portfolio for the authenticated user.
   * REQ-001, AC-001
   */
  @Post()
  public async createPortfolio(
    @Body() body: CreatePortfolioDto
  ): Promise<Portfolio> {
    if (!this.request.user.settings?.settings?.isBaseCurrencyConsentGiven) {
      throw new HttpException('Consent required', HttpStatus.FORBIDDEN);
    }

    const { name, baseCurrency } = body;

    this.validateBaseCurrency(baseCurrency);

    try {
      return await this.portfolioManagementService.createPortfolio(
        this.request.user.id,
        name,
        baseCurrency
      );
    } catch (error) {
      if (error.message.includes('Unique constraint')) {
        throw new HttpException(
          'Portfolio with this name already exists for this user',
          HttpStatus.CONFLICT
        );
      }
      throw error;
    }
  }

  /**
   * PUT /portfolio-management/:id/base-currency
   * Update base currency.
   * REQ-001, AC-001
   */
  @Put(':id/base-currency')
  public async updateBaseCurrency(
    @Param('id') portfolioId: string,
    @Body() body: UpdateBaseCurrencyDto
  ): Promise<Portfolio> {
    const { baseCurrency } = body;

    this.validateBaseCurrency(baseCurrency);

    const portfolio = await this.portfolioManagementService.updateBaseCurrency(
      portfolioId,
      this.request.user.id,
      baseCurrency
    );

    if (!portfolio) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    return portfolio;
  }

  /**
   * DELETE /portfolio-management/:id
   * Delete a portfolio owned by the authenticated user.
   * REQ-001
   */
  @Delete(':id')
  public async deletePortfolio(
    @Param('id') portfolioId: string
  ): Promise<void> {
    const deleted = await this.portfolioManagementService.deletePortfolio(
      portfolioId,
      this.request.user.id
    );

    if (!deleted) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
  }

  private validateBaseCurrency(baseCurrency: string): void {
    if (!SUPPORTED_BASE_CURRENCIES.includes(baseCurrency as any)) {
      throw new HttpException(
        `Invalid base currency. Supported currencies: ${SUPPORTED_BASE_CURRENCIES.join(', ')}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
