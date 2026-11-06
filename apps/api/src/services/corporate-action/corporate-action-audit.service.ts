import { buildIdempotencyKey } from '@ghostfolio/api/services/corporate-action/corporate-action.helper';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';

import { Injectable } from '@nestjs/common';
import { CorporateActionEvent, DataSource } from '@prisma/client';
import { subHours } from 'date-fns';

interface InsertPendingParams {
  amountPerShare?: number;
  dataSource: DataSource;
  denominator?: number;
  effectiveDate: Date;
  newSymbol?: string;
  numerator?: number;
  symbol: string;
  symbolProfileId: string;
  type: string;
}

interface TransitionStatusParams {
  appliedCount?: number;
  eventId: string;
  failedCount?: number;
  failureReason?: string;
  skippedCount?: number;
  status: string;
}

interface GetUserEntriesParams {
  skip?: number;
  take?: number;
  userId: string;
}

interface GetAdminEntriesParams {
  skip?: number;
  status?: string;
  take?: number;
}

@Injectable()
export class CorporateActionAuditService {
  public constructor(private readonly prismaService: PrismaService) {}

  public async insertPending({
    amountPerShare,
    dataSource,
    denominator,
    effectiveDate,
    newSymbol,
    numerator,
    symbol,
    symbolProfileId,
    type
  }: InsertPendingParams): Promise<{
    alreadyExists: boolean;
    event: CorporateActionEvent | null;
  }> {
    const idempotencyKey = buildIdempotencyKey({
      dataSource,
      date: effectiveDate,
      symbol,
      type
    });

    try {
      const event = await this.prismaService.corporateActionEvent.create({
        data: {
          amountPerShare,
          dataSource,
          denominator,
          effectiveDate,
          idempotencyKey,
          newSymbol,
          numerator,
          status: 'PENDING',
          symbol,
          symbolProfileId,
          type
        }
      });

      return { alreadyExists: false, event };
    } catch (error) {
      if (error.code === 'P2002') {
        return { alreadyExists: true, event: null };
      }

      throw error;
    }
  }

  public async getUserEntries({
    skip = 0,
    take = 50,
    userId
  }: GetUserEntriesParams): Promise<{
    entries: CorporateActionEvent[];
    total: number;
  }> {
    const clampedTake = Math.min(take, 200);

    const where = {
      symbolProfile: {
        activities: {
          some: {
            userId
          }
        }
      }
    };

    const [entries, total] = await Promise.all([
      this.prismaService.corporateActionEvent.findMany({
        orderBy: [{ effectiveDate: 'desc' }],
        skip,
        take: clampedTake,
        where
      }),
      this.prismaService.corporateActionEvent.count({ where })
    ]);

    return { entries, total };
  }

  public async getAdminEntries({
    skip = 0,
    status,
    take = 50
  }: GetAdminEntriesParams): Promise<{
    entries: CorporateActionEvent[];
    total: number;
  }> {
    const clampedTake = Math.min(take, 200);

    const where = status ? { status } : {};

    const [entries, total] = await Promise.all([
      this.prismaService.corporateActionEvent.findMany({
        orderBy: [{ effectiveDate: 'desc' }],
        skip,
        take: clampedTake,
        where
      }),
      this.prismaService.corporateActionEvent.count({ where })
    ]);

    return { entries, total };
  }

  public async transitionStatus({
    appliedCount,
    eventId,
    failedCount,
    failureReason,
    skippedCount,
    status
  }: TransitionStatusParams): Promise<CorporateActionEvent> {
    return this.prismaService.corporateActionEvent.update({
      data: {
        appliedCount: appliedCount ?? 0,
        failedCount: failedCount ?? 0,
        failureReason,
        processedAt: new Date(),
        skippedCount: skippedCount ?? 0,
        status
      },
      where: { id: eventId }
    });
  }

  public async flagRevisedEvent({
    amountPerShare,
    dataSource,
    denominator,
    effectiveDate,
    numerator,
    symbol,
    type
  }: {
    amountPerShare?: number;
    dataSource: DataSource;
    denominator?: number;
    effectiveDate: Date;
    numerator?: number;
    symbol: string;
    type: string;
  }): Promise<boolean> {
    const idempotencyKey = buildIdempotencyKey({
      dataSource,
      date: effectiveDate,
      symbol,
      type
    });

    const existing = await this.prismaService.corporateActionEvent.findUnique({
      where: { idempotencyKey }
    });

    if (!existing) {
      return false;
    }

    const isRevised =
      existing.numerator !== (numerator ?? null) ||
      existing.denominator !== (denominator ?? null) ||
      existing.amountPerShare !== (amountPerShare ?? null);

    if (!isRevised) {
      return false;
    }

    await this.prismaService.corporateActionEvent.update({
      data: {
        failureReason: 'REVISED_EVENT',
        status: 'FLAGGED_MANUAL'
      },
      where: { id: existing.id }
    });

    return true;
  }

  public async getStalePendingCount(): Promise<number> {
    const staleThreshold = subHours(new Date(), 24);

    return this.prismaService.corporateActionEvent.count({
      where: {
        createdAt: {
          lt: staleThreshold
        },
        status: 'PENDING'
      }
    });
  }
}
