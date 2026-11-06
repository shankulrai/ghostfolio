import { DataSource } from '@prisma/client';

import {
  buildIdempotencyKey,
  calculateExDateBasisQuantity,
  convertDividendAmount,
  isDividendWithinProximity,
  normalizeRatio,
  toUtcCalendarDay
} from './corporate-action.helper';

describe('CorporateActionHelper', () => {
  describe('normalizeRatio', () => {
    it.each([
      [2, 1, 2, 1],
      [4, 2, 2, 1],
      [1, 3, 1, 3],
      [10, 1, 10, 1],
      [1, 8, 1, 8],
      [6, 3, 2, 1]
    ])(
      'normalizes %d:%d to %d:%d',
      (num, denom, expectedNum, expectedDenom) => {
        const result = normalizeRatio(num, denom);
        expect(result).toEqual({
          numerator: expectedNum,
          denominator: expectedDenom
        });
      }
    );

    it('throws on non-positive values', () => {
      expect(() => normalizeRatio(0, 1)).toThrow('Invalid ratio');
      expect(() => normalizeRatio(1, 0)).toThrow('Invalid ratio');
      expect(() => normalizeRatio(-1, 1)).toThrow('Invalid ratio');
    });

    it('throws on non-integers', () => {
      expect(() => normalizeRatio(1.5, 1)).toThrow('Invalid ratio');
      expect(() => normalizeRatio(1, 2.5)).toThrow('Invalid ratio');
    });
  });

  describe('toUtcCalendarDay', () => {
    const originalTZ = process.env.TZ;

    afterEach(() => {
      process.env.TZ = originalTZ;
    });

    it('converts 2024-06-10T13:30:00.000Z to 2024-06-10 00:00:00 local', () => {
      process.env.TZ = 'UTC';
      const input = new Date('2024-06-10T13:30:00.000Z');
      const result = toUtcCalendarDay(input);

      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(5);
      expect(result.getDate()).toBe(10);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });

    it('converts 2024-06-10T23:30:00.000Z to 2024-06-10 00:00:00 when TZ=America/New_York', () => {
      process.env.TZ = 'America/New_York';
      const input = new Date('2024-06-10T23:30:00.000Z');
      const result = toUtcCalendarDay(input);

      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(5);
      expect(result.getDate()).toBe(10);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
    });

    it('converts 2024-06-10T00:30:00.000Z to 2024-06-10 00:00:00 when TZ=Asia/Tokyo', () => {
      process.env.TZ = 'Asia/Tokyo';
      const input = new Date('2024-06-10T00:30:00.000Z');
      const result = toUtcCalendarDay(input);

      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(5);
      expect(result.getDate()).toBe(10);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
    });
  });

  describe('buildIdempotencyKey', () => {
    it('builds stable key from datasource, symbol, type and date', () => {
      const date = new Date('2024-06-10T13:30:00.000Z');
      const result = buildIdempotencyKey({
        dataSource: DataSource.YAHOO,
        date,
        symbol: 'AAPL',
        type: 'SPLIT'
      });

      expect(result).toBe('YAHOO:AAPL:SPLIT:2024-06-10');
    });

    it('uses only the date portion, ignoring time', () => {
      const date1 = new Date('2024-06-10T08:00:00.000Z');
      const date2 = new Date('2024-06-10T20:00:00.000Z');

      const key1 = buildIdempotencyKey({
        dataSource: DataSource.YAHOO,
        date: date1,
        symbol: 'NVDA',
        type: 'DIVIDEND'
      });
      const key2 = buildIdempotencyKey({
        dataSource: DataSource.YAHOO,
        date: date2,
        symbol: 'NVDA',
        type: 'DIVIDEND'
      });

      expect(key1).toBe(key2);
    });
  });

  describe('calculateExDateBasisQuantity', () => {
    it('counts only BUY and SELL orders strictly before ex-date', () => {
      const exDate = new Date('2024-06-10T00:00:00.000Z');
      const orders = [
        { date: new Date('2024-06-01'), quantity: 100, type: 'BUY' },
        { date: new Date('2024-06-05'), quantity: 50, type: 'BUY' },
        { date: new Date('2024-06-08'), quantity: 20, type: 'SELL' },
        { date: new Date('2024-06-10'), quantity: 30, type: 'BUY' },
        { date: new Date('2024-06-15'), quantity: 10, type: 'BUY' }
      ];

      const result = calculateExDateBasisQuantity({ exDate, orders });

      expect(result).toBe(130);
    });

    it('returns zero when user sold all shares before ex-date', () => {
      const exDate = new Date('2024-06-10T00:00:00.000Z');
      const orders = [
        { date: new Date('2024-06-01'), quantity: 100, type: 'BUY' },
        { date: new Date('2024-06-08'), quantity: 100, type: 'SELL' }
      ];

      const result = calculateExDateBasisQuantity({ exDate, orders });

      expect(result).toBe(0);
    });

    it('returns zero when no orders exist before ex-date', () => {
      const exDate = new Date('2024-06-10T00:00:00.000Z');
      const orders = [
        { date: new Date('2024-06-10'), quantity: 100, type: 'BUY' },
        { date: new Date('2024-06-15'), quantity: 50, type: 'BUY' }
      ];

      const result = calculateExDateBasisQuantity({ exDate, orders });

      expect(result).toBe(0);
    });

    it('scales quantities by splits between order date and ex-date', () => {
      const exDate = new Date('2024-06-15');
      const orders = [
        { date: new Date('2024-06-01'), quantity: 10, type: 'BUY' }
      ];
      const splits = [
        { date: new Date('2024-06-10'), denominator: 1, numerator: 10 }
      ];

      const result = calculateExDateBasisQuantity({ exDate, orders, splits });

      expect(result).toBe(100);
    });

    it('ignores splits after the ex-date', () => {
      const exDate = new Date('2024-06-15');
      const orders = [
        { date: new Date('2024-06-01'), quantity: 10, type: 'BUY' }
      ];
      const splits = [
        { date: new Date('2024-07-01'), denominator: 1, numerator: 10 }
      ];

      const result = calculateExDateBasisQuantity({ exDate, orders, splits });

      expect(result).toBe(10);
    });
  });

  describe('convertDividendAmount', () => {
    it('adjusts amount by dividing through later splits', () => {
      const result = convertDividendAmount({
        amountPerShare: 0.004,
        laterSplits: [{ numerator: 10, denominator: 1 }]
      });

      expect(result).toBeCloseTo(0.04, 6);
    });

    it('applies multiple splits in sequence', () => {
      const result = convertDividendAmount({
        amountPerShare: 0.002,
        laterSplits: [
          { numerator: 2, denominator: 1 },
          { numerator: 5, denominator: 1 }
        ]
      });

      expect(result).toBeCloseTo(0.02, 6);
    });

    it('returns amount unchanged when no later splits', () => {
      const result = convertDividendAmount({
        amountPerShare: 0.5,
        laterSplits: []
      });

      expect(result).toBe(0.5);
    });

    it('handles reverse splits correctly', () => {
      const result = convertDividendAmount({
        amountPerShare: 0.8,
        laterSplits: [{ numerator: 1, denominator: 8 }]
      });

      expect(result).toBeCloseTo(0.1, 6);
    });
  });

  describe('isDividendWithinProximity', () => {
    it('returns true when candidate is within proximity window', () => {
      const candidateDate = new Date('2024-06-10T00:00:00.000Z');
      const existingDividends = [
        { date: new Date('2024-06-05T00:00:00.000Z') }
      ];

      const result = isDividendWithinProximity({
        candidateDate,
        existingDividends,
        proximityDays: 7
      });

      expect(result).toBe(true);
    });

    it('returns false when candidate is outside proximity window', () => {
      const candidateDate = new Date('2024-06-10T00:00:00.000Z');
      const existingDividends = [
        { date: new Date('2024-05-01T00:00:00.000Z') }
      ];

      const result = isDividendWithinProximity({
        candidateDate,
        existingDividends,
        proximityDays: 7
      });

      expect(result).toBe(false);
    });

    it('returns false when no existing dividends', () => {
      const candidateDate = new Date('2024-06-10T00:00:00.000Z');

      const result = isDividendWithinProximity({
        candidateDate,
        existingDividends: [],
        proximityDays: 7
      });

      expect(result).toBe(false);
    });

    it('uses absolute difference, checking both directions', () => {
      const candidateDate = new Date('2024-06-10T00:00:00.000Z');
      const existingDividends = [
        { date: new Date('2024-06-14T00:00:00.000Z') }
      ];

      const result = isDividendWithinProximity({
        candidateDate,
        existingDividends,
        proximityDays: 7
      });

      expect(result).toBe(true);
    });
  });
});
