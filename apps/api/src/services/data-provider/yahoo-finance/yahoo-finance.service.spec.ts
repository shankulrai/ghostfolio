import { CryptocurrencyService } from '@ghostfolio/api/services/cryptocurrency/cryptocurrency.service';
import { YahooFinanceDataEnhancerService } from '@ghostfolio/api/services/data-provider/data-enhancer/yahoo-finance/yahoo-finance.service';

import { YahooFinanceService } from './yahoo-finance.service';

jest.mock('yahoo-finance2');

describe('YahooFinanceService', () => {
  let service: YahooFinanceService;
  let mockYahooFinance: any;
  let mockCryptocurrencyService: CryptocurrencyService;
  let mockYahooFinanceDataEnhancerService: YahooFinanceDataEnhancerService;

  beforeEach(() => {
    mockYahooFinance = {
      chart: jest.fn()
    };

    mockCryptocurrencyService = {} as CryptocurrencyService;

    mockYahooFinanceDataEnhancerService = {
      convertToYahooFinanceSymbol: jest.fn((symbol) => symbol)
    } as any;

    service = new YahooFinanceService(
      mockCryptocurrencyService,
      mockYahooFinanceDataEnhancerService
    );

    (service as any).yahooFinance = mockYahooFinance;
  });

  describe('getCorporateActions', () => {
    it('returns splits and dividends when yahoo provides valid events', async () => {
      const mockChartResult = {
        events: {
          splits: [
            {
              date: new Date('2024-06-10T00:00:00.000Z'),
              numerator: 10,
              denominator: 1,
              splitRatio: '10:1'
            },
            {
              date: new Date('2020-08-31T00:00:00.000Z'),
              numerator: 4,
              denominator: 1,
              splitRatio: '4:1'
            }
          ],
          dividends: [
            {
              date: new Date('2024-03-05T00:00:00.000Z'),
              amount: 0.004
            },
            {
              date: new Date('2023-12-01T00:00:00.000Z'),
              amount: 0.5
            }
          ]
        },
        meta: {}
      };

      mockYahooFinance.chart.mockResolvedValue(mockChartResult);

      const result = await service.getCorporateActions({
        from: new Date('2020-01-01'),
        symbol: 'NVDA',
        to: new Date('2024-12-31')
      });

      expect(result.splits).toHaveLength(2);
      expect(result.splits[0]).toEqual({
        date: new Date('2024-06-10T00:00:00.000Z'),
        numerator: 10,
        denominator: 1
      });
      expect(result.splits[1]).toEqual({
        date: new Date('2020-08-31T00:00:00.000Z'),
        numerator: 4,
        denominator: 1
      });
      expect(result.dividends).toHaveLength(2);
      expect(result.dividends[0]).toEqual({
        date: new Date('2024-03-05T00:00:00.000Z'),
        amountPerShare: 0.004
      });
      expect(result.dividends[1]).toEqual({
        date: new Date('2023-12-01T00:00:00.000Z'),
        amountPerShare: 0.5
      });
      expect(result.mergers).toEqual([]);
    });

    it('returns empty arrays when yahoo provides no events', async () => {
      mockYahooFinance.chart.mockResolvedValue({ meta: {} });

      const result = await service.getCorporateActions({
        from: new Date('2020-01-01'),
        symbol: 'AAPL',
        to: new Date('2024-12-31')
      });

      expect(result.splits).toEqual([]);
      expect(result.dividends).toEqual([]);
      expect(result.mergers).toEqual([]);
    });

    it('filters out malformed split data with invalid dates', async () => {
      const mockChartResult = {
        events: {
          splits: [
            {
              date: new Date('2024-06-10T00:00:00.000Z'),
              numerator: 4,
              denominator: 1,
              splitRatio: '4:1'
            },
            {
              date: new Date('invalid'),
              numerator: 2,
              denominator: 1,
              splitRatio: '2:1'
            }
          ]
        },
        meta: {}
      };

      mockYahooFinance.chart.mockResolvedValue(mockChartResult);

      const result = await service.getCorporateActions({
        from: new Date('2020-01-01'),
        symbol: 'TEST',
        to: new Date('2024-12-31')
      });

      expect(result.splits).toHaveLength(1);
      expect(result.splits[0].numerator).toBe(4);
    });

    it('filters out malformed split data with non-integer ratios', async () => {
      const mockChartResult = {
        events: {
          splits: [
            {
              date: new Date('2024-06-10T00:00:00.000Z'),
              numerator: 4,
              denominator: 1,
              splitRatio: '4:1'
            },
            {
              date: new Date('2024-05-01T00:00:00.000Z'),
              numerator: 1.5,
              denominator: 1,
              splitRatio: '1.5:1'
            }
          ]
        },
        meta: {}
      };

      mockYahooFinance.chart.mockResolvedValue(mockChartResult);

      const result = await service.getCorporateActions({
        from: new Date('2020-01-01'),
        symbol: 'TEST',
        to: new Date('2024-12-31')
      });

      expect(result.splits).toHaveLength(1);
      expect(result.splits[0].numerator).toBe(4);
    });

    it('filters out malformed split data with zero or negative ratios', async () => {
      const mockChartResult = {
        events: {
          splits: [
            {
              date: new Date('2024-06-10T00:00:00.000Z'),
              numerator: 4,
              denominator: 1,
              splitRatio: '4:1'
            },
            {
              date: new Date('2024-05-01T00:00:00.000Z'),
              numerator: 0,
              denominator: 1,
              splitRatio: '0:1'
            },
            {
              date: new Date('2024-04-01T00:00:00.000Z'),
              numerator: 2,
              denominator: -1,
              splitRatio: '2:-1'
            }
          ]
        },
        meta: {}
      };

      mockYahooFinance.chart.mockResolvedValue(mockChartResult);

      const result = await service.getCorporateActions({
        from: new Date('2020-01-01'),
        symbol: 'TEST',
        to: new Date('2024-12-31')
      });

      expect(result.splits).toHaveLength(1);
      expect(result.splits[0].numerator).toBe(4);
    });

    it('filters out malformed dividend data with invalid dates', async () => {
      const mockChartResult = {
        events: {
          dividends: [
            {
              date: new Date('2024-03-05T00:00:00.000Z'),
              amount: 0.5
            },
            {
              date: new Date('invalid'),
              amount: 0.25
            }
          ]
        },
        meta: {}
      };

      mockYahooFinance.chart.mockResolvedValue(mockChartResult);

      const result = await service.getCorporateActions({
        from: new Date('2020-01-01'),
        symbol: 'TEST',
        to: new Date('2024-12-31')
      });

      expect(result.dividends).toHaveLength(1);
      expect(result.dividends[0].amountPerShare).toBe(0.5);
    });

    it('filters out malformed dividend data with non-finite or non-positive amounts', async () => {
      const mockChartResult = {
        events: {
          dividends: [
            {
              date: new Date('2024-03-05T00:00:00.000Z'),
              amount: 0.5
            },
            {
              date: new Date('2024-02-01T00:00:00.000Z'),
              amount: Infinity
            },
            {
              date: new Date('2024-01-01T00:00:00.000Z'),
              amount: -0.1
            },
            {
              date: new Date('2023-12-01T00:00:00.000Z'),
              amount: 0
            }
          ]
        },
        meta: {}
      };

      mockYahooFinance.chart.mockResolvedValue(mockChartResult);

      const result = await service.getCorporateActions({
        from: new Date('2020-01-01'),
        symbol: 'TEST',
        to: new Date('2024-12-31')
      });

      expect(result.dividends).toHaveLength(1);
      expect(result.dividends[0].amountPerShare).toBe(0.5);
    });

    it('returns empty arrays when symbol is delisted', async () => {
      mockYahooFinance.chart.mockRejectedValue(
        new Error('No data found, symbol may be delisted')
      );

      const result = await service.getCorporateActions({
        from: new Date('2020-01-01'),
        symbol: 'TWTR',
        to: new Date('2024-12-31')
      });

      expect(result.splits).toEqual([]);
      expect(result.dividends).toEqual([]);
      expect(result.mergers).toEqual([]);
    });

    it('returns empty arrays on rate limit error', async () => {
      const rateLimitError = new Error('Too Many Requests');
      (rateLimitError as any).name = 'HTTPError';
      (rateLimitError as any).code = 429;

      mockYahooFinance.chart.mockRejectedValue(rateLimitError);

      const result = await service.getCorporateActions({
        from: new Date('2020-01-01'),
        symbol: 'AAPL',
        to: new Date('2024-12-31')
      });

      expect(result.splits).toEqual([]);
      expect(result.dividends).toEqual([]);
      expect(result.mergers).toEqual([]);
    });

    it('returns empty arrays on generic error', async () => {
      mockYahooFinance.chart.mockRejectedValue(new Error('Network timeout'));

      const result = await service.getCorporateActions({
        from: new Date('2020-01-01'),
        symbol: 'AAPL',
        to: new Date('2024-12-31')
      });

      expect(result.splits).toEqual([]);
      expect(result.dividends).toEqual([]);
      expect(result.mergers).toEqual([]);
    });
  });
});
