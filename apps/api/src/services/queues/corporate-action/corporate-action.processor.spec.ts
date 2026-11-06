import { CorporateActionApplyService } from '@ghostfolio/api/services/corporate-action/corporate-action-apply.service';
import { CorporateActionAuditService } from '@ghostfolio/api/services/corporate-action/corporate-action-audit.service';
import { CorporateActionDetectionService } from '@ghostfolio/api/services/corporate-action/corporate-action-detection.service';
import { CorporateActionTelemetry } from '@ghostfolio/api/services/corporate-action/corporate-action-telemetry';
import { CORPORATE_ACTION_JOB_OPTIONS } from '@ghostfolio/common/config';
import { DataSource } from '@ghostfolio/prisma/enums';

import { Job } from 'bull';

import { CorporateActionProcessor } from './corporate-action.processor';

describe('CorporateActionProcessor', () => {
  let processor: CorporateActionProcessor;
  let mockApplyService: jest.Mocked<CorporateActionApplyService>;
  let mockAuditService: jest.Mocked<CorporateActionAuditService>;
  let mockConfigurationService: any;
  let mockCorporateActionService: any;
  let mockDetectionService: jest.Mocked<CorporateActionDetectionService>;
  let mockPrismaService: any;
  let mockTelemetry: jest.Mocked<CorporateActionTelemetry>;

  beforeEach(() => {
    mockApplyService = {
      applyEvent: jest.fn().mockResolvedValue({
        appliedCount: 1,
        failedCount: 0,
        skippedCount: 0,
        status: 'APPLIED'
      })
    } as any;

    mockAuditService = {
      transitionStatus: jest.fn()
    } as any;

    mockConfigurationService = {
      get: jest.fn().mockReturnValue(true)
    };

    mockCorporateActionService = {
      enqueueApply: jest.fn()
    };

    mockDetectionService = {
      detectForSymbol: jest.fn().mockResolvedValue([])
    } as any;

    mockPrismaService = {
      corporateActionEvent: {
        findUnique: jest.fn()
      }
    };

    mockTelemetry = {
      emitApplyFailed: jest.fn()
    } as any;

    processor = new CorporateActionProcessor(
      mockApplyService,
      mockAuditService,
      mockConfigurationService,
      mockCorporateActionService,
      mockDetectionService,
      mockPrismaService,
      mockTelemetry
    );
  });

  describe('detect', () => {
    it('should enqueue apply for each newly detected event', async () => {
      const job = {
        data: { dataSource: DataSource.YAHOO, symbol: 'AAPL' }
      } as Job;

      mockDetectionService.detectForSymbol.mockResolvedValue([
        { id: 'event-1' } as any,
        { id: 'event-2' } as any
      ]);

      await processor.detect(job);

      expect(mockCorporateActionService.enqueueApply).toHaveBeenCalledWith({
        eventId: 'event-1'
      });
      expect(mockCorporateActionService.enqueueApply).toHaveBeenCalledWith({
        eventId: 'event-2'
      });
    });

    it('should detect corporate actions for a symbol', async () => {
      const job = {
        data: { dataSource: DataSource.YAHOO, symbol: 'AAPL' }
      } as Job;

      await processor.detect(job);

      expect(mockDetectionService.detectForSymbol).toHaveBeenCalledWith({
        dataSource: DataSource.YAHOO,
        symbol: 'AAPL'
      });
    });

    it('should throw on detection failure', async () => {
      const job = {
        data: { dataSource: DataSource.YAHOO, symbol: 'AAPL' }
      } as Job;
      const error = new Error('Detection failed');

      mockDetectionService.detectForSymbol.mockRejectedValue(error);

      await expect(processor.detect(job)).rejects.toThrow('Detection failed');
    });
  });

  describe('apply', () => {
    it('should skip apply when feature is disabled', async () => {
      mockConfigurationService.get.mockReturnValue(false);

      const job = {
        data: { eventId: 'event-1' },
        attemptsMade: 0,
        opts: CORPORATE_ACTION_JOB_OPTIONS
      } as Job;

      await processor.apply(job);

      expect(
        mockPrismaService.corporateActionEvent.findUnique
      ).not.toHaveBeenCalled();
      expect(mockApplyService.applyEvent).not.toHaveBeenCalled();
    });

    it('should apply a corporate action event', async () => {
      const mockEvent = {
        id: 'event-123',
        symbol: 'AAPL',
        type: 'SPLIT'
      } as any;
      const job = {
        data: { eventId: 'event-123' },
        attemptsMade: 0,
        opts: CORPORATE_ACTION_JOB_OPTIONS
      } as Job;

      mockPrismaService.corporateActionEvent.findUnique.mockResolvedValue(
        mockEvent
      );

      await processor.apply(job);

      expect(
        mockPrismaService.corporateActionEvent.findUnique
      ).toHaveBeenCalledWith({
        where: { id: 'event-123' }
      });
      expect(mockApplyService.applyEvent).toHaveBeenCalledWith(mockEvent);
      expect(mockAuditService.transitionStatus).toHaveBeenCalledWith({
        appliedCount: 1,
        eventId: 'event-123',
        failedCount: 0,
        skippedCount: 0,
        status: 'APPLIED'
      });
    });

    it('should discard job if event not found', async () => {
      const job = {
        data: { eventId: 'event-404' },
        discard: jest.fn()
      } as any;

      mockPrismaService.corporateActionEvent.findUnique.mockResolvedValue(null);

      await processor.apply(job);

      expect(job.discard).toHaveBeenCalled();
      expect(mockApplyService.applyEvent).not.toHaveBeenCalled();
    });

    it('should mark event as FAILED after max retries', async () => {
      const mockEvent = {
        id: 'event-456',
        symbol: 'AAPL',
        type: 'SPLIT'
      } as any;
      const job = {
        data: { eventId: 'event-456' },
        attemptsMade: 3,
        opts: { attempts: 3 },
        discard: jest.fn()
      } as any;
      const error = new Error('Apply failed');

      mockPrismaService.corporateActionEvent.findUnique.mockResolvedValue(
        mockEvent
      );
      mockApplyService.applyEvent.mockRejectedValue(error);

      await processor.apply(job);

      expect(mockAuditService.transitionStatus).toHaveBeenCalledWith({
        eventId: 'event-456',
        status: 'FAILED',
        failureReason: 'MAX_RETRIES'
      });
      expect(mockTelemetry.emitApplyFailed).toHaveBeenCalledWith({
        eventId: 'event-456',
        symbol: 'AAPL',
        type: 'SPLIT',
        errorCode: 'MAX_RETRIES'
      });
      expect(job.discard).toHaveBeenCalled();
    });

    it('should rethrow on apply failure before max retries', async () => {
      const mockEvent = {
        id: 'event-789',
        symbol: 'AAPL',
        type: 'SPLIT'
      } as any;
      const job = {
        data: { eventId: 'event-789' },
        attemptsMade: 1,
        opts: { attempts: 3 }
      } as Job;
      const error = new Error('Temporary failure');

      mockPrismaService.corporateActionEvent.findUnique.mockResolvedValue(
        mockEvent
      );
      mockApplyService.applyEvent.mockRejectedValue(error);

      await expect(processor.apply(job)).rejects.toThrow('Temporary failure');
      expect(mockAuditService.transitionStatus).not.toHaveBeenCalled();
    });

    it('should not fail if marking as FAILED throws', async () => {
      const mockEvent = {
        id: 'event-999',
        symbol: 'AAPL',
        type: 'SPLIT'
      } as any;
      const job = {
        data: { eventId: 'event-999' },
        attemptsMade: 3,
        opts: { attempts: 3 },
        discard: jest.fn()
      } as any;

      mockPrismaService.corporateActionEvent.findUnique.mockResolvedValue(
        mockEvent
      );
      mockApplyService.applyEvent.mockRejectedValue(new Error('Apply failed'));
      mockAuditService.transitionStatus.mockRejectedValue(
        new Error('Mark failed')
      );

      await processor.apply(job);

      expect(job.discard).toHaveBeenCalled();
    });
  });
});
