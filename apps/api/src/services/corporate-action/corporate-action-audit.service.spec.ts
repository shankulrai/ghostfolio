import { DataSource } from '@prisma/client';
import { subHours } from 'date-fns';

import { CorporateActionAuditService } from './corporate-action-audit.service';

describe('CorporateActionAuditService', () => {
  let service: CorporateActionAuditService;
  let mockPrismaService: any;

  beforeEach(() => {
    mockPrismaService = {
      corporateActionEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn()
      }
    };

    service = new CorporateActionAuditService(mockPrismaService);
  });

  describe('flagRevisedEvent', () => {
    const baseParams = {
      dataSource: DataSource.YAHOO,
      effectiveDate: new Date('2024-06-10'),
      symbol: 'AAPL',
      type: 'SPLIT'
    };

    it('flags a pending event whose provider values changed', async () => {
      mockPrismaService.corporateActionEvent.findUnique.mockResolvedValue({
        amountPerShare: null,
        denominator: 1,
        id: 'event-1',
        numerator: 2,
        status: 'PENDING'
      });

      const result = await service.flagRevisedEvent({
        ...baseParams,
        denominator: 1,
        numerator: 3
      });

      expect(result).toBe(true);
      expect(
        mockPrismaService.corporateActionEvent.update
      ).toHaveBeenCalledWith({
        data: { failureReason: 'REVISED_EVENT', status: 'FLAGGED_MANUAL' },
        where: { id: 'event-1' }
      });
    });

    it('flags an already applied event whose provider values changed', async () => {
      mockPrismaService.corporateActionEvent.findUnique.mockResolvedValue({
        amountPerShare: null,
        denominator: 1,
        id: 'event-2',
        numerator: 2,
        status: 'APPLIED'
      });

      const result = await service.flagRevisedEvent({
        ...baseParams,
        denominator: 1,
        numerator: 3
      });

      expect(result).toBe(true);
      expect(
        mockPrismaService.corporateActionEvent.update
      ).toHaveBeenCalledWith({
        data: { failureReason: 'REVISED_EVENT', status: 'FLAGGED_MANUAL' },
        where: { id: 'event-2' }
      });
    });

    it('leaves a pending event unchanged when provider values match', async () => {
      mockPrismaService.corporateActionEvent.findUnique.mockResolvedValue({
        amountPerShare: null,
        denominator: 1,
        id: 'event-1',
        numerator: 2,
        status: 'PENDING'
      });

      const result = await service.flagRevisedEvent({
        ...baseParams,
        denominator: 1,
        numerator: 2
      });

      expect(result).toBe(false);
      expect(
        mockPrismaService.corporateActionEvent.update
      ).not.toHaveBeenCalled();
    });
  });

  describe('insertPending', () => {
    it('creates a pending event when no duplicate exists', async () => {
      const createdEvent = {
        id: 'event-1',
        idempotencyKey: 'YAHOO:AAPL:SPLIT:2024-06-10',
        symbolProfileId: 'profile-1',
        dataSource: DataSource.YAHOO,
        symbol: 'AAPL',
        type: 'SPLIT',
        effectiveDate: new Date('2024-06-10'),
        numerator: 4,
        denominator: 1,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrismaService.corporateActionEvent.create.mockResolvedValue(
        createdEvent
      );

      const result = await service.insertPending({
        dataSource: DataSource.YAHOO,
        denominator: 1,
        effectiveDate: new Date('2024-06-10'),
        numerator: 4,
        symbol: 'AAPL',
        symbolProfileId: 'profile-1',
        type: 'SPLIT'
      });

      expect(result.alreadyExists).toBe(false);
      expect(result.event).toBe(createdEvent);
      expect(
        mockPrismaService.corporateActionEvent.create
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
            idempotencyKey: 'YAHOO:AAPL:SPLIT:2024-06-10'
          })
        })
      );
    });

    it('reports already exists when P2002 conflict occurs', async () => {
      const p2002Error = new Error('Unique constraint failed');
      (p2002Error as any).code = 'P2002';

      mockPrismaService.corporateActionEvent.create.mockRejectedValue(
        p2002Error
      );

      const result = await service.insertPending({
        dataSource: DataSource.YAHOO,
        denominator: 1,
        effectiveDate: new Date('2024-06-10'),
        numerator: 4,
        symbol: 'AAPL',
        symbolProfileId: 'profile-1',
        type: 'SPLIT'
      });

      expect(result.alreadyExists).toBe(true);
      expect(result.event).toBeNull();
    });

    it('rethrows non-P2002 errors', async () => {
      mockPrismaService.corporateActionEvent.create.mockRejectedValue(
        new Error('Database connection lost')
      );

      await expect(
        service.insertPending({
          dataSource: DataSource.YAHOO,
          denominator: 1,
          effectiveDate: new Date('2024-06-10'),
          numerator: 4,
          symbol: 'AAPL',
          symbolProfileId: 'profile-1',
          type: 'SPLIT'
        })
      ).rejects.toThrow('Database connection lost');
    });

    it('includes optional fields when provided', async () => {
      const createdEvent = {
        id: 'event-2',
        idempotencyKey: 'YAHOO:AAPL:DIVIDEND:2024-03-05',
        symbolProfileId: 'profile-1',
        dataSource: DataSource.YAHOO,
        symbol: 'AAPL',
        type: 'DIVIDEND',
        effectiveDate: new Date('2024-03-05'),
        amountPerShare: 0.25,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockPrismaService.corporateActionEvent.create.mockResolvedValue(
        createdEvent
      );

      await service.insertPending({
        amountPerShare: 0.25,
        dataSource: DataSource.YAHOO,
        effectiveDate: new Date('2024-03-05'),
        symbol: 'AAPL',
        symbolProfileId: 'profile-1',
        type: 'DIVIDEND'
      });

      expect(
        mockPrismaService.corporateActionEvent.create
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amountPerShare: 0.25
          })
        })
      );
    });
  });

  describe('getUserEntries', () => {
    it('fetches entries for splits and mergers the user holds', async () => {
      const mockEntries = [
        {
          id: 'event-1',
          type: 'SPLIT',
          symbol: 'AAPL',
          effectiveDate: new Date('2024-06-10')
        },
        {
          id: 'event-2',
          type: 'MERGER',
          symbol: 'TWTR',
          effectiveDate: new Date('2023-10-27')
        }
      ];

      mockPrismaService.corporateActionEvent.findMany.mockResolvedValue(
        mockEntries
      );
      mockPrismaService.corporateActionEvent.count.mockResolvedValue(2);

      const result = await service.getUserEntries({
        skip: 0,
        take: 50,
        userId: 'user-1'
      });

      expect(result.entries).toBe(mockEntries);
      expect(result.total).toBe(2);
      expect(
        mockPrismaService.corporateActionEvent.findMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            symbolProfile: {
              activities: {
                some: {
                  userId: 'user-1'
                }
              }
            }
          },
          orderBy: [{ effectiveDate: 'desc' }]
        })
      );
    });

    it('clamps take to maximum 200', async () => {
      mockPrismaService.corporateActionEvent.findMany.mockResolvedValue([]);
      mockPrismaService.corporateActionEvent.count.mockResolvedValue(0);

      await service.getUserEntries({
        skip: 0,
        take: 500,
        userId: 'user-1'
      });

      expect(
        mockPrismaService.corporateActionEvent.findMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 200
        })
      );
    });

    it('uses default skip and take when not provided', async () => {
      mockPrismaService.corporateActionEvent.findMany.mockResolvedValue([]);
      mockPrismaService.corporateActionEvent.count.mockResolvedValue(0);

      await service.getUserEntries({ userId: 'user-1' });

      expect(
        mockPrismaService.corporateActionEvent.findMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 50
        })
      );
    });
  });

  describe('getAdminEntries', () => {
    it('fetches all entries when no status filter is provided', async () => {
      const mockEntries = [
        {
          id: 'event-1',
          status: 'APPLIED'
        },
        {
          id: 'event-2',
          status: 'PENDING'
        }
      ];

      mockPrismaService.corporateActionEvent.findMany.mockResolvedValue(
        mockEntries
      );
      mockPrismaService.corporateActionEvent.count.mockResolvedValue(2);

      const result = await service.getAdminEntries({
        skip: 0,
        take: 50
      });

      expect(result.entries).toBe(mockEntries);
      expect(result.total).toBe(2);
      expect(
        mockPrismaService.corporateActionEvent.findMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {}
        })
      );
    });

    it('filters by status when provided', async () => {
      const mockEntries = [{ id: 'event-1', status: 'FAILED' }];

      mockPrismaService.corporateActionEvent.findMany.mockResolvedValue(
        mockEntries
      );
      mockPrismaService.corporateActionEvent.count.mockResolvedValue(1);

      await service.getAdminEntries({
        skip: 0,
        status: 'FAILED',
        take: 50
      });

      expect(
        mockPrismaService.corporateActionEvent.findMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'FAILED' }
        })
      );
    });

    it('clamps take to maximum 200', async () => {
      mockPrismaService.corporateActionEvent.findMany.mockResolvedValue([]);
      mockPrismaService.corporateActionEvent.count.mockResolvedValue(0);

      await service.getAdminEntries({
        skip: 0,
        take: 1000
      });

      expect(
        mockPrismaService.corporateActionEvent.findMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 200
        })
      );
    });

    it('orders by effectiveDate descending', async () => {
      mockPrismaService.corporateActionEvent.findMany.mockResolvedValue([]);
      mockPrismaService.corporateActionEvent.count.mockResolvedValue(0);

      await service.getAdminEntries({});

      expect(
        mockPrismaService.corporateActionEvent.findMany
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ effectiveDate: 'desc' }]
        })
      );
    });
  });

  describe('transitionStatus', () => {
    it('updates event status and counts', async () => {
      const updatedEvent = {
        id: 'event-1',
        status: 'APPLIED',
        appliedCount: 3,
        skippedCount: 1,
        failedCount: 0,
        processedAt: new Date()
      };

      mockPrismaService.corporateActionEvent.update.mockResolvedValue(
        updatedEvent
      );

      const result = await service.transitionStatus({
        appliedCount: 3,
        eventId: 'event-1',
        failedCount: 0,
        skippedCount: 1,
        status: 'APPLIED'
      });

      expect(result).toBe(updatedEvent);
      expect(
        mockPrismaService.corporateActionEvent.update
      ).toHaveBeenCalledWith({
        data: {
          appliedCount: 3,
          failedCount: 0,
          failureReason: undefined,
          processedAt: expect.any(Date),
          skippedCount: 1,
          status: 'APPLIED'
        },
        where: { id: 'event-1' }
      });
    });

    it('defaults counts to zero when not provided', async () => {
      const updatedEvent = {
        id: 'event-2',
        status: 'SKIPPED_CONFLICT'
      };

      mockPrismaService.corporateActionEvent.update.mockResolvedValue(
        updatedEvent
      );

      await service.transitionStatus({
        eventId: 'event-2',
        status: 'SKIPPED_CONFLICT'
      });

      expect(
        mockPrismaService.corporateActionEvent.update
      ).toHaveBeenCalledWith({
        data: expect.objectContaining({
          appliedCount: 0,
          failedCount: 0,
          skippedCount: 0
        }),
        where: { id: 'event-2' }
      });
    });

    it('includes failure reason when provided', async () => {
      const updatedEvent = {
        id: 'event-3',
        status: 'FAILED',
        failureReason: 'PROVIDER_TIMEOUT'
      };

      mockPrismaService.corporateActionEvent.update.mockResolvedValue(
        updatedEvent
      );

      await service.transitionStatus({
        eventId: 'event-3',
        failureReason: 'PROVIDER_TIMEOUT',
        status: 'FAILED'
      });

      expect(
        mockPrismaService.corporateActionEvent.update
      ).toHaveBeenCalledWith({
        data: expect.objectContaining({
          failureReason: 'PROVIDER_TIMEOUT'
        }),
        where: { id: 'event-3' }
      });
    });
  });

  describe('getStalePendingCount', () => {
    it('counts pending events older than 24 hours', async () => {
      mockPrismaService.corporateActionEvent.count.mockResolvedValue(5);

      const result = await service.getStalePendingCount();

      expect(result).toBe(5);
      expect(mockPrismaService.corporateActionEvent.count).toHaveBeenCalledWith(
        {
          where: {
            createdAt: {
              lt: expect.any(Date)
            },
            status: 'PENDING'
          }
        }
      );

      const call =
        mockPrismaService.corporateActionEvent.count.mock.calls[0][0];
      const threshold = call.where.createdAt.lt;
      const expected = subHours(new Date(), 24);
      const diff = Math.abs(threshold.getTime() - expected.getTime());

      expect(diff).toBeLessThan(1000);
    });
  });
});
