import { DataSource } from '@prisma/client';

import { CorporateActionApplyService } from './corporate-action-apply.service';

describe('CorporateActionApplyService', () => {
  let service: CorporateActionApplyService;
  let mockActivitiesService: any;
  let mockAssetProfileSplitService: any;
  let mockAssetProfilesService: any;
  let mockPrismaService: any;
  let mockTelemetry: any;

  beforeEach(() => {
    mockActivitiesService = {
      createActivity: jest.fn(),
      getUserIdsBySymbolProfileId: jest.fn()
    };

    mockAssetProfileSplitService = {
      createIfAbsent: jest.fn(),
      getSplits: jest.fn()
    };

    mockAssetProfilesService = {
      gatherSymbolAndEmitPortfolioChangedEvents: jest.fn()
    };

    mockPrismaService = {
      order: {
        findFirst: jest.fn(),
        findMany: jest.fn()
      }
    };

    mockTelemetry = {
      emitApplyCompleted: jest.fn(),
      emitApplyFailed: jest.fn(),
      emitApplyStarted: jest.fn(),
      emitRecomputeRequested: jest.fn()
    };

    service = new CorporateActionApplyService(
      mockActivitiesService,
      mockAssetProfileSplitService,
      mockAssetProfilesService,
      mockPrismaService,
      mockTelemetry
    );
  });

  describe('applyEvent', () => {
    it('applies split successfully and triggers gather before recompute', async () => {
      const event = {
        dataSource: DataSource.YAHOO,
        denominator: 1,
        effectiveDate: new Date('2024-06-10'),
        id: 'event-1',
        numerator: 4,
        symbol: 'AAPL',
        symbolProfileId: 'profile-1',
        type: 'SPLIT'
      } as any;

      mockAssetProfileSplitService.createIfAbsent.mockResolvedValue({
        conflict: false,
        split: {}
      });

      mockAssetProfilesService.gatherSymbolAndEmitPortfolioChangedEvents.mockResolvedValue(
        undefined
      );

      const result = await service.applyEvent(event);

      expect(result.status).toBe('APPLIED');
      expect(result.appliedCount).toBe(1);
      expect(result.skippedCount).toBe(0);
      expect(result.failedCount).toBe(0);

      expect(
        mockAssetProfilesService.gatherSymbolAndEmitPortfolioChangedEvents
      ).toHaveBeenCalledWith({
        dataSource: DataSource.YAHOO,
        force: true,
        symbol: 'AAPL',
        symbolProfileId: 'profile-1'
      });

      expect(mockTelemetry.emitRecomputeRequested).toHaveBeenCalledWith({
        eventId: 'event-1',
        symbol: 'AAPL'
      });
    });

    it('reports skipped when split conflict occurs', async () => {
      const event = {
        dataSource: DataSource.YAHOO,
        denominator: 1,
        effectiveDate: new Date('2024-06-10'),
        id: 'event-2',
        numerator: 4,
        symbol: 'AAPL',
        symbolProfileId: 'profile-1',
        type: 'SPLIT'
      } as any;

      mockAssetProfileSplitService.createIfAbsent.mockResolvedValue({
        conflict: true,
        split: null
      });

      const result = await service.applyEvent(event);

      expect(result.status).toBe('SKIPPED_CONFLICT');
      expect(result.appliedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
      expect(result.failedCount).toBe(0);

      expect(
        mockAssetProfilesService.gatherSymbolAndEmitPortfolioChangedEvents
      ).not.toHaveBeenCalled();
    });

    it('applies dividend to holders with ex-date basis quantity', async () => {
      const event = {
        amountPerShare: 0.25,
        dataSource: DataSource.YAHOO,
        effectiveDate: new Date('2024-03-05'),
        id: 'event-3',
        symbol: 'AAPL',
        symbolProfileId: 'profile-1',
        type: 'DIVIDEND'
      } as any;

      mockActivitiesService.getUserIdsBySymbolProfileId.mockResolvedValue([
        'user-1'
      ]);

      mockAssetProfileSplitService.getSplits.mockResolvedValue([]);

      mockPrismaService.order.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            date: new Date('2024-01-01'),
            quantity: 100,
            type: 'BUY'
          }
        ]);

      mockPrismaService.order.findFirst.mockResolvedValue({
        accountId: 'account-1'
      });

      mockActivitiesService.createActivity.mockResolvedValue({});

      const result = await service.applyEvent(event);

      expect(result.status).toBe('APPLIED');
      expect(result.appliedCount).toBe(1);

      expect(mockActivitiesService.createActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'account-1',
          comment: 'Auto-created by corporate action event-3',
          quantity: 100,
          type: 'DIVIDEND',
          unitPrice: 0.25,
          updateAccountBalance: true
        })
      );
    });

    it('skips dividend when holder sold before ex-date', async () => {
      const event = {
        amountPerShare: 0.25,
        dataSource: DataSource.YAHOO,
        effectiveDate: new Date('2024-03-05'),
        id: 'event-4',
        symbol: 'AAPL',
        symbolProfileId: 'profile-1',
        type: 'DIVIDEND'
      } as any;

      mockActivitiesService.getUserIdsBySymbolProfileId.mockResolvedValue([
        'user-1'
      ]);

      mockAssetProfileSplitService.getSplits.mockResolvedValue([]);

      mockPrismaService.order.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            date: new Date('2024-01-01'),
            quantity: 100,
            type: 'BUY'
          },
          {
            date: new Date('2024-02-01'),
            quantity: 100,
            type: 'SELL'
          }
        ]);

      const result = await service.applyEvent(event);

      expect(result.status).toBe('APPLIED');
      expect(result.appliedCount).toBe(0);
      expect(result.skippedCount).toBe(1);

      expect(mockActivitiesService.createActivity).not.toHaveBeenCalled();
    });

    it('reports SKIPPED_CONFLICT when every holder has a dividend within proximity', async () => {
      const event = {
        amountPerShare: 0.25,
        dataSource: DataSource.YAHOO,
        effectiveDate: new Date('2024-03-05'),
        id: 'event-6',
        symbol: 'AAPL',
        symbolProfileId: 'profile-1',
        type: 'DIVIDEND'
      } as any;

      mockActivitiesService.getUserIdsBySymbolProfileId.mockResolvedValue([
        'user-1'
      ]);

      mockAssetProfileSplitService.getSplits.mockResolvedValue([]);

      mockPrismaService.order.findMany.mockResolvedValueOnce([
        { date: new Date('2024-03-03') }
      ]);

      const result = await service.applyEvent(event);

      expect(result.status).toBe('SKIPPED_CONFLICT');
      expect(result.appliedCount).toBe(0);
      expect(result.skippedCount).toBe(1);

      expect(mockActivitiesService.createActivity).not.toHaveBeenCalled();
    });

    it('flags merger as manual', async () => {
      const event = {
        dataSource: DataSource.YAHOO,
        effectiveDate: new Date('2023-10-27'),
        id: 'event-5',
        newSymbol: 'X',
        symbol: 'TWTR',
        symbolProfileId: 'profile-1',
        type: 'MERGER'
      } as any;

      const result = await service.applyEvent(event);

      expect(result.status).toBe('FLAGGED_MANUAL');
      expect(result.appliedCount).toBe(0);
    });
  });
});
