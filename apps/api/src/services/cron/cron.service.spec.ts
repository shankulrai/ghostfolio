import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { CorporateActionDetectionService } from '@ghostfolio/api/services/corporate-action/corporate-action-detection.service';
import { CorporateActionTelemetry } from '@ghostfolio/api/services/corporate-action/corporate-action-telemetry';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';
import { CorporateActionService } from '@ghostfolio/api/services/queues/corporate-action/corporate-action.service';
import { DataSource } from '@ghostfolio/prisma/enums';

import { CronService } from './cron.service';

describe('CronService', () => {
  let service: CronService;
  let mockConfigurationService: jest.Mocked<ConfigurationService>;
  let mockCorporateActionDetectionService: jest.Mocked<CorporateActionDetectionService>;
  let mockCorporateActionService: jest.Mocked<CorporateActionService>;
  let mockCorporateActionTelemetry: jest.Mocked<CorporateActionTelemetry>;
  let mockPropertyService: jest.Mocked<PropertyService>;

  beforeEach(() => {
    mockConfigurationService = {
      get: jest.fn()
    } as any;

    mockCorporateActionDetectionService = {
      getDetectTargets: jest.fn()
    } as any;

    mockCorporateActionService = {
      enqueueDetectBatch: jest.fn()
    } as any;

    mockCorporateActionTelemetry = {
      emitDetectRunSummary: jest.fn()
    } as any;

    mockPropertyService = {
      getByKey: jest.fn()
    } as any;

    service = new CronService(
      mockConfigurationService,
      mockCorporateActionDetectionService,
      mockCorporateActionService,
      mockCorporateActionTelemetry,
      {} as any,
      mockPropertyService,
      {} as any,
      {} as any,
      {} as any
    );
  });

  describe('runEveryDayAtOneAm', () => {
    it('should return early if feature toggle is off', async () => {
      mockConfigurationService.get.mockReturnValue(false);

      await service.runEveryDayAtOneAm();

      expect(
        mockCorporateActionDetectionService.getDetectTargets
      ).not.toHaveBeenCalled();
    });

    it('should return early if data gathering is disabled', async () => {
      mockConfigurationService.get.mockReturnValue(true);
      mockPropertyService.getByKey.mockResolvedValue(false);

      await service.runEveryDayAtOneAm();

      expect(
        mockCorporateActionDetectionService.getDetectTargets
      ).not.toHaveBeenCalled();
    });

    it('should emit heartbeat with zero targets when no targets found', async () => {
      mockConfigurationService.get.mockReturnValue(true);
      mockPropertyService.getByKey.mockResolvedValue(true);
      mockCorporateActionDetectionService.getDetectTargets.mockResolvedValue(
        []
      );

      await service.runEveryDayAtOneAm();

      expect(
        mockCorporateActionTelemetry.emitDetectRunSummary
      ).toHaveBeenCalledWith({
        enqueuedCount: 0,
        symbolsTotal: 0,
        zeroIncluded: true
      });
      expect(
        mockCorporateActionService.enqueueDetectBatch
      ).not.toHaveBeenCalled();
    });

    it('should enqueue detect jobs when targets exist', async () => {
      const targets = [
        { dataSource: DataSource.YAHOO, symbol: 'AAPL' },
        { dataSource: DataSource.YAHOO, symbol: 'MSFT' }
      ];

      mockConfigurationService.get.mockReturnValue(true);
      mockPropertyService.getByKey.mockResolvedValue(true);
      mockCorporateActionDetectionService.getDetectTargets.mockResolvedValue(
        targets
      );

      await service.runEveryDayAtOneAm();

      expect(
        mockCorporateActionTelemetry.emitDetectRunSummary
      ).toHaveBeenCalledWith({
        enqueuedCount: 2,
        symbolsTotal: 2,
        zeroIncluded: false
      });
      expect(
        mockCorporateActionService.enqueueDetectBatch
      ).toHaveBeenCalledWith(targets);
    });

    it('should respect PROPERTY_IS_DATA_GATHERING_ENABLED', async () => {
      mockConfigurationService.get.mockReturnValue(true);
      mockPropertyService.getByKey.mockResolvedValue(false);

      await service.runEveryDayAtOneAm();

      expect(
        mockCorporateActionDetectionService.getDetectTargets
      ).not.toHaveBeenCalled();
    });
  });
});
