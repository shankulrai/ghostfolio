import { DataProviderService } from '@ghostfolio/api/services/data-provider/data-provider.service';
import { FxRateCacheService } from '@ghostfolio/api/services/fx-rate-cache/fx-rate-cache.service';
import { MarketDataService } from '@ghostfolio/api/services/market-data/market-data.service';
import { PrismaService } from '@ghostfolio/api/services/prisma/prisma.service';
import { PropertyService } from '@ghostfolio/api/services/property/property.service';

import { Test, TestingModule } from '@nestjs/testing';

import { ExchangeRateDataService } from './exchange-rate-data.service';

describe('ExchangeRateDataService', () => {
  let service: ExchangeRateDataService;
  let fxRateCacheService: {
    getCachedRate: jest.Mock;
    isProviderUnavailable: jest.Mock;
    setCachedRate: jest.Mock;
  };
  let marketDataService: jest.Mocked<MarketDataService>;

  beforeEach(async () => {
    const marketDataServiceMock = {
      get: jest.fn()
    };

    const dataProviderServiceMock = {
      getDataSourceForExchangeRates: jest.fn().mockReturnValue('YAHOO')
    };

    fxRateCacheService = {
      getCachedRate: jest.fn().mockResolvedValue(null),
      isProviderUnavailable: jest.fn().mockResolvedValue(false),
      setCachedRate: jest.fn().mockResolvedValue(undefined)
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeRateDataService,
        { provide: DataProviderService, useValue: dataProviderServiceMock },
        { provide: FxRateCacheService, useValue: fxRateCacheService },
        { provide: MarketDataService, useValue: marketDataServiceMock },
        { provide: PrismaService, useValue: {} },
        { provide: PropertyService, useValue: {} }
      ]
    }).compile();

    service = module.get<ExchangeRateDataService>(ExchangeRateDataService);
    marketDataService = module.get(MarketDataService);
  });

  it('should skip FX conversion and flag the provider when it is unavailable', async () => {
    fxRateCacheService.isProviderUnavailable.mockResolvedValue(true);

    const results = await service.batchConvert([
      {
        value: 100,
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        date: new Date('2024-01-15')
      }
    ]);

    expect(results[0].convertedValue).toBeNull();
    expect(results[0].fxProviderUnavailable).toBe(true);
    expect(marketDataService.get).not.toHaveBeenCalled();
  });

  it('should serve a cached rate without querying market data', async () => {
    fxRateCacheService.getCachedRate.mockResolvedValue(1.1);

    const results = await service.batchConvert([
      {
        value: 100,
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        date: new Date('2024-01-15')
      }
    ]);

    expect(results[0].convertedValue).toBeCloseTo(110);
    expect(marketDataService.get).not.toHaveBeenCalled();
  });

  it('should cache an exact-date market rate', async () => {
    marketDataService.get.mockResolvedValue({
      marketPrice: 1.08,
      isCarriedForward: false
    } as any);

    await service.batchConvert([
      {
        value: 100,
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        date: new Date('2024-01-15')
      }
    ]);

    expect(fxRateCacheService.setCachedRate).toHaveBeenCalledWith(
      'EURUSD',
      new Date('2024-01-15'),
      1.08
    );
  });

  describe('batchConvert', () => {
    it('should group conversions by tuple correctly', async () => {
      const testDate = new Date('2024-01-15');
      const conversions = [
        { value: 100, fromCurrency: 'EUR', toCurrency: 'USD', date: testDate },
        { value: 200, fromCurrency: 'EUR', toCurrency: 'USD', date: testDate },
        { value: 150, fromCurrency: 'GBP', toCurrency: 'USD', date: testDate }
      ];

      marketDataService.get.mockResolvedValue({
        marketPrice: 1.1,
        isCarriedForward: false
      } as any);

      await service.batchConvert(conversions);

      // Should only call marketDataService.get twice (one per unique currency pair)
      expect(marketDataService.get).toHaveBeenCalledTimes(2);
      expect(marketDataService.get).toHaveBeenCalledWith({
        dataSource: 'YAHOO',
        symbol: 'EURUSD',
        date: testDate
      });
      expect(marketDataService.get).toHaveBeenCalledWith({
        dataSource: 'YAHOO',
        symbol: 'GBPUSD',
        date: testDate
      });
    });

    it('should preserve input order in output', async () => {
      const testDate = new Date('2024-01-15');
      const conversions = [
        { value: 100, fromCurrency: 'EUR', toCurrency: 'USD', date: testDate },
        { value: 200, fromCurrency: 'GBP', toCurrency: 'USD', date: testDate },
        { value: 300, fromCurrency: 'EUR', toCurrency: 'USD', date: testDate }
      ];

      marketDataService.get
        .mockResolvedValueOnce({
          marketPrice: 1.1,
          isCarriedForward: false
        } as any)
        .mockResolvedValueOnce({
          marketPrice: 1.3,
          isCarriedForward: false
        } as any);

      const results = await service.batchConvert(conversions);

      expect(results).toHaveLength(3);
      expect(results[0].convertedValue).toBeCloseTo(110, 2); // 100 * 1.1
      expect(results[1].convertedValue).toBeCloseTo(260, 2); // 200 * 1.3
      expect(results[2].convertedValue).toBeCloseTo(330, 2); // 300 * 1.1
    });

    it('should handle fallback rates (forward-fill)', async () => {
      const testDate = new Date('2024-01-15');
      const fallbackDate = new Date('2024-01-12'); // Friday; Sunday and Saturday skipped
      const conversions = [
        { value: 100, fromCurrency: 'EUR', toCurrency: 'USD', date: testDate }
      ];

      // First call (exact date) returns null, second call (fallback) succeeds
      marketDataService.get.mockResolvedValueOnce(null).mockResolvedValueOnce({
        marketPrice: 1.08,
        isCarriedForward: false
      } as any);

      const results = await service.batchConvert(conversions);

      expect(results[0].fallbackUsed).toBe(true);
      expect(results[0].fallbackDate).toEqual(fallbackDate);
      expect(results[0].convertedValue).toBe(108); // 100 * 1.08
      expect(marketDataService.get).toHaveBeenCalledTimes(2);
    });

    it('should return fallbackUsed flag correctly when rate is carried forward', async () => {
      const testDate = new Date('2024-01-15');
      const conversions = [
        { value: 100, fromCurrency: 'EUR', toCurrency: 'USD', date: testDate }
      ];

      marketDataService.get.mockResolvedValue({
        marketPrice: 1.1,
        isCarriedForward: true
      } as any);

      const results = await service.batchConvert(conversions);

      expect(results[0].fallbackUsed).toBe(true);
      expect(results[0].fallbackDate).toEqual(testDate);
    });

    it('should handle same currency conversion (no query needed)', async () => {
      const testDate = new Date('2024-01-15');
      const conversions = [
        { value: 100, fromCurrency: 'USD', toCurrency: 'USD', date: testDate }
      ];

      const results = await service.batchConvert(conversions);

      expect(results[0].rate).toBe(1);
      expect(results[0].convertedValue).toBe(100);
      expect(results[0].fallbackUsed).toBe(false);
      expect(marketDataService.get).not.toHaveBeenCalled();
    });

    it('should return unavailable rate instead of 1:1 when no rate exists', async () => {
      const testDate = new Date('2024-01-15');
      const conversions = [
        { value: 100, fromCurrency: 'XYZ', toCurrency: 'USD', date: testDate }
      ];

      // Simulate no rate found even after forward-fill attempts
      marketDataService.get.mockResolvedValue(null);

      const results = await service.batchConvert(conversions);

      expect(results[0].rate).toBeNull();
      expect(results[0].convertedValue).toBeNull();
      expect(results[0].rateUnavailable).toBe(true);
      expect(results[0].fallbackUsed).toBe(false);
    });

    it('should skip weekend dates during forward-fill', async () => {
      const saturday = new Date('2024-01-20');
      const conversions = [
        { value: 100, fromCurrency: 'EUR', toCurrency: 'USD', date: saturday }
      ];

      marketDataService.get.mockResolvedValueOnce(null).mockResolvedValueOnce({
        marketPrice: 1.09,
        isCarriedForward: false
      } as any);

      const results = await service.batchConvert(conversions);

      expect(results[0].fallbackDate).toEqual(new Date('2024-01-19'));
      expect(marketDataService.get).toHaveBeenCalledTimes(2);
    });

    it('should group by date correctly', async () => {
      const date1 = new Date('2024-01-15');
      const date2 = new Date('2024-01-16');
      const conversions = [
        { value: 100, fromCurrency: 'EUR', toCurrency: 'USD', date: date1 },
        { value: 200, fromCurrency: 'EUR', toCurrency: 'USD', date: date2 }
      ];

      marketDataService.get.mockResolvedValue({
        marketPrice: 1.1,
        isCarriedForward: false
      } as any);

      await service.batchConvert(conversions);

      // Should call twice (different dates = different tuples)
      expect(marketDataService.get).toHaveBeenCalledTimes(2);
      expect(marketDataService.get).toHaveBeenCalledWith({
        dataSource: 'YAHOO',
        symbol: 'EURUSD',
        date: date1
      });
      expect(marketDataService.get).toHaveBeenCalledWith({
        dataSource: 'YAHOO',
        symbol: 'EURUSD',
        date: date2
      });
    });
  });
});
