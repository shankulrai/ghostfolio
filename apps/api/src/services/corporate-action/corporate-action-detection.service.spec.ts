import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';

import { DataSource } from '@prisma/client';
import { subDays } from 'date-fns';

import { CorporateActionDetectionService } from './corporate-action-detection.service';

describe('CorporateActionDetectionService', () => {
  let service: CorporateActionDetectionService;
  let mockConfigurationService: any;
  let mockCorporateActionAuditService: any;
  let mockDataProviderService: any;
  let mockPrismaService: any;
  let mockTelemetry: any;

  beforeEach(() => {
    mockConfigurationService = {
      get: jest.fn().mockReturnValue(true)
    };

    mockCorporateActionAuditService = {
      insertPending: jest.fn()
    };

    mockDataProviderService = {
      getCorporateActions: jest.fn()
    };

    mockPrismaService = {
      symbolProfile: {
        findMany: jest.fn(),
        findUnique: jest.fn()
      }
    };

    mockTelemetry = {
      emitDetectSymbolCompleted: jest.fn(),
      emitDetectSymbolFailed: jest.fn()
    };

    service = new CorporateActionDetectionService(
      mockConfigurationService as ConfigurationService,
      mockCorporateActionAuditService,
      mockDataProviderService,
      mockPrismaService,
      mockTelemetry
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getDetectTargets', () => {
    it('returns empty array when feature is disabled', async () => {
      mockConfigurationService.get.mockReturnValue(false);

      const result = await service.getDetectTargets();

      expect(result).toEqual([]);
      expect(mockPrismaService.symbolProfile.findMany).not.toHaveBeenCalled();
    });

    it('returns Yahoo profiles with activities and isActive true', async () => {
      mockConfigurationService.get.mockReturnValue(true);

      mockPrismaService.symbolProfile.findMany.mockResolvedValue([
        { dataSource: DataSource.YAHOO, symbol: 'AAPL' },
        { dataSource: DataSource.YAHOO, symbol: 'NVDA' }
      ]);

      const result = await service.getDetectTargets();

      expect(result).toEqual([
        { dataSource: DataSource.YAHOO, symbol: 'AAPL' },
        { dataSource: DataSource.YAHOO, symbol: 'NVDA' }
      ]);

      expect(mockPrismaService.symbolProfile.findMany).toHaveBeenCalledWith({
        select: {
          dataSource: true,
          symbol: true
        },
        where: {
          activities: {
            some: {}
          },
          dataSource: DataSource.YAHOO,
          isActive: true
        }
      });
    });
  });

  describe('detectForSymbol', () => {
    it('detects and inserts split within lookback window', async () => {
      const today = new Date('2024-06-20');
      jest.spyOn(global, 'Date').mockImplementation(() => today);

      mockPrismaService.symbolProfile.findUnique.mockResolvedValue({
        id: 'profile-1'
      });

      mockDataProviderService.getCorporateActions.mockResolvedValue({
        dividends: [],
        mergers: [],
        splits: [
          {
            date: new Date('2024-06-10'),
            denominator: 1,
            numerator: 4
          }
        ]
      });

      mockCorporateActionAuditService.insertPending.mockResolvedValue({
        alreadyExists: false,
        event: {}
      });

      await service.detectForSymbol({
        dataSource: DataSource.YAHOO,
        symbol: 'AAPL'
      });

      expect(
        mockCorporateActionAuditService.insertPending
      ).toHaveBeenCalledWith({
        dataSource: DataSource.YAHOO,
        denominator: 1,
        effectiveDate: new Date('2024-06-10'),
        numerator: 4,
        symbol: 'AAPL',
        symbolProfileId: 'profile-1',
        type: 'SPLIT'
      });

      expect(mockTelemetry.emitDetectSymbolCompleted).toHaveBeenCalledWith({
        eventsDetected: 1,
        symbol: 'AAPL'
      });
    });

    it('skips events older than lookback window', async () => {
      mockPrismaService.symbolProfile.findUnique.mockResolvedValue({
        id: 'profile-1'
      });

      const oldDate = subDays(new Date(), 10);

      mockDataProviderService.getCorporateActions.mockResolvedValue({
        dividends: [],
        mergers: [],
        splits: [
          {
            date: oldDate,
            denominator: 1,
            numerator: 2
          }
        ]
      });

      await service.detectForSymbol({
        dataSource: DataSource.YAHOO,
        symbol: 'AAPL'
      });

      expect(
        mockCorporateActionAuditService.insertPending
      ).not.toHaveBeenCalled();

      expect(mockTelemetry.emitDetectSymbolCompleted).toHaveBeenCalledWith({
        eventsDetected: 0,
        symbol: 'AAPL'
      });
    });

    it('does not increment count when event already exists', async () => {
      mockPrismaService.symbolProfile.findUnique.mockResolvedValue({
        id: 'profile-1'
      });

      mockDataProviderService.getCorporateActions.mockResolvedValue({
        dividends: [
          {
            amount: 0.25,
            date: new Date('2024-06-15')
          }
        ],
        mergers: [],
        splits: []
      });

      mockCorporateActionAuditService.insertPending.mockResolvedValue({
        alreadyExists: true,
        event: null
      });

      await service.detectForSymbol({
        dataSource: DataSource.YAHOO,
        symbol: 'AAPL'
      });

      expect(mockTelemetry.emitDetectSymbolCompleted).toHaveBeenCalledWith({
        eventsDetected: 0,
        symbol: 'AAPL'
      });
    });

    it('emits failure when symbol profile not found', async () => {
      mockPrismaService.symbolProfile.findUnique.mockResolvedValue(null);

      await service.detectForSymbol({
        dataSource: DataSource.YAHOO,
        symbol: 'INVALID'
      });

      expect(mockTelemetry.emitDetectSymbolFailed).toHaveBeenCalledWith({
        errorCode: 'profile_not_found',
        symbol: 'INVALID'
      });

      expect(
        mockDataProviderService.getCorporateActions
      ).not.toHaveBeenCalled();
    });

    it('emits failure when provider throws error', async () => {
      mockPrismaService.symbolProfile.findUnique.mockResolvedValue({
        id: 'profile-1'
      });

      mockDataProviderService.getCorporateActions.mockRejectedValue(
        new Error('Rate limit')
      );

      await service.detectForSymbol({
        dataSource: DataSource.YAHOO,
        symbol: 'AAPL'
      });

      expect(mockTelemetry.emitDetectSymbolFailed).toHaveBeenCalledWith({
        errorCode: 'provider_error',
        symbol: 'AAPL'
      });

      expect(
        mockCorporateActionAuditService.insertPending
      ).not.toHaveBeenCalled();
    });

    it('detects dividends and mergers', async () => {
      mockPrismaService.symbolProfile.findUnique.mockResolvedValue({
        id: 'profile-1'
      });

      const recentDate1 = subDays(new Date(), 2);
      const recentDate2 = subDays(new Date(), 3);

      mockDataProviderService.getCorporateActions.mockResolvedValue({
        dividends: [
          {
            amountPerShare: 0.25,
            date: recentDate1
          }
        ],
        mergers: [
          {
            date: recentDate2,
            newSymbol: 'X'
          }
        ],
        splits: []
      });

      mockCorporateActionAuditService.insertPending.mockResolvedValue({
        alreadyExists: false,
        event: {}
      });

      await service.detectForSymbol({
        dataSource: DataSource.YAHOO,
        symbol: 'TWTR'
      });

      expect(
        mockCorporateActionAuditService.insertPending
      ).toHaveBeenCalledTimes(2);

      expect(
        mockCorporateActionAuditService.insertPending
      ).toHaveBeenCalledWith({
        amountPerShare: 0.25,
        dataSource: DataSource.YAHOO,
        effectiveDate: recentDate1,
        symbol: 'TWTR',
        symbolProfileId: 'profile-1',
        type: 'DIVIDEND'
      });

      expect(
        mockCorporateActionAuditService.insertPending
      ).toHaveBeenCalledWith({
        dataSource: DataSource.YAHOO,
        effectiveDate: recentDate2,
        newSymbol: 'X',
        symbol: 'TWTR',
        symbolProfileId: 'profile-1',
        type: 'MERGER'
      });
    });
  });
});
