import { DataSource } from '@prisma/client';

import { CorporateActionsController } from './corporate-actions.controller';

describe('CorporateActionsController', () => {
  let controller: CorporateActionsController;
  let mockCorporateActionAuditService: any;

  beforeEach(() => {
    mockCorporateActionAuditService = {
      getAdminEntries: jest.fn(),
      getStalePendingCount: jest.fn(),
      getUserEntries: jest.fn()
    };

    controller = new CorporateActionsController(
      mockCorporateActionAuditService
    );
  });

  describe('getCorporateActions', () => {
    it('returns user entries with default pagination', async () => {
      const mockEntries = [
        {
          dataSource: DataSource.YAHOO,
          effectiveDate: new Date('2024-06-10'),
          id: 'event-1',
          status: 'APPLIED',
          symbol: 'AAPL',
          type: 'SPLIT'
        }
      ];

      mockCorporateActionAuditService.getUserEntries.mockResolvedValue({
        entries: mockEntries,
        total: 1
      });

      const result = await controller.getCorporateActions(
        { userId: 'user-1' } as any,
        {}
      );

      expect(result).toEqual({
        entries: mockEntries,
        skip: 0,
        take: 50,
        total: 1
      });
      expect(
        mockCorporateActionAuditService.getUserEntries
      ).toHaveBeenCalledWith({
        skip: 0,
        take: 50,
        userId: 'user-1'
      });
    });

    it('returns user entries with custom pagination', async () => {
      mockCorporateActionAuditService.getUserEntries.mockResolvedValue({
        entries: [],
        total: 0
      });

      await controller.getCorporateActions({ userId: 'user-2' } as any, {
        skip: 10,
        take: 100
      });

      expect(
        mockCorporateActionAuditService.getUserEntries
      ).toHaveBeenCalledWith({
        skip: 10,
        take: 100,
        userId: 'user-2'
      });
    });
  });

  describe('getAdminCorporateActions', () => {
    it('returns admin entries with counts', async () => {
      const mockEntries = [
        {
          appliedCount: 1,
          dataSource: DataSource.YAHOO,
          effectiveDate: new Date('2024-06-10'),
          failedCount: 0,
          id: 'event-1',
          skippedCount: 0,
          status: 'APPLIED',
          symbol: 'AAPL',
          type: 'SPLIT'
        }
      ];

      mockCorporateActionAuditService.getAdminEntries
        .mockResolvedValueOnce({ entries: mockEntries, total: 1 })
        .mockResolvedValueOnce({ entries: [], total: 0 });

      mockCorporateActionAuditService.getStalePendingCount.mockResolvedValue(0);

      const result = await controller.getAdminCorporateActions({});

      expect(result).toEqual({
        entries: mockEntries,
        failedCount: 0,
        skip: 0,
        stalePendingCount: 0,
        take: 50,
        total: 1
      });

      expect(
        mockCorporateActionAuditService.getAdminEntries
      ).toHaveBeenCalledWith({
        skip: 0,
        take: 50
      });

      expect(
        mockCorporateActionAuditService.getAdminEntries
      ).toHaveBeenCalledWith({
        skip: 0,
        status: 'FAILED',
        take: 1
      });

      expect(
        mockCorporateActionAuditService.getStalePendingCount
      ).toHaveBeenCalled();
    });

    it('returns failed count when failures exist', async () => {
      mockCorporateActionAuditService.getAdminEntries
        .mockResolvedValueOnce({ entries: [], total: 0 })
        .mockResolvedValueOnce({
          entries: [{ id: 'failed-1' }],
          total: 1
        });

      mockCorporateActionAuditService.getStalePendingCount.mockResolvedValue(2);

      const result = await controller.getAdminCorporateActions({
        skip: 0,
        take: 25
      });

      expect(result.failedCount).toBe(1);
      expect(result.stalePendingCount).toBe(2);
    });
  });
});
