import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { Injectable } from '@nestjs/common';
import { Portfolio } from '@prisma/client';

/**
 * CRUD operations for Portfolio entity.
 * REQ-001: Portfolio entity with base currency preference
 * REQ-009: Default portfolio creation on user signup
 */
@Injectable()
export class PortfolioManagementService {
  public constructor(private readonly prismaService: PrismaService) {}

  /**
   * Create a new portfolio for a user.
   * REQ-001, AC-001
   */
  public async createPortfolio(
    userId: string,
    name: string,
    baseCurrency: string
  ): Promise<Portfolio> {
    return this.prismaService.portfolio.create({
      data: {
        userId,
        name,
        baseCurrency
      }
    });
  }

  /**
   * Get all portfolios for a user.
   * REQ-001, AC-001
   */
  public async getPortfoliosByUser(userId: string): Promise<Portfolio[]> {
    return this.prismaService.portfolio.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' }
    });
  }

  /**
   * Get the default portfolio (first created) for a user.
   * REQ-009, AC-009
   */
  public async getDefaultPortfolio(userId: string): Promise<Portfolio | null> {
    const portfolios = await this.prismaService.portfolio.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: 1
    });

    return portfolios[0] || null;
  }

  /**
   * Update the base currency of a portfolio owned by the user.
   * Returns null when the portfolio does not exist or belongs to another user.
   * REQ-001, AC-001
   */
  public async updateBaseCurrency(
    portfolioId: string,
    userId: string,
    baseCurrency: string
  ): Promise<Portfolio | null> {
    const portfolio = await this.prismaService.portfolio.findFirst({
      where: { id: portfolioId, userId }
    });

    if (!portfolio) {
      return null;
    }

    return this.prismaService.portfolio.update({
      where: { id: portfolioId },
      data: { baseCurrency }
    });
  }

  /**
   * Delete a portfolio owned by the user. Cascade delete is handled by Prisma schema (onDelete: Cascade).
   * Returns false when the portfolio does not exist or belongs to another user.
   * REQ-001
   */
  public async deletePortfolio(
    portfolioId: string,
    userId: string
  ): Promise<boolean> {
    const { count } = await this.prismaService.portfolio.deleteMany({
      where: { id: portfolioId, userId }
    });

    return count > 0;
  }
}
