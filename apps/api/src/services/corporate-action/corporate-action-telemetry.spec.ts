import { Logger } from '@nestjs/common';

import { CorporateActionTelemetry } from './corporate-action-telemetry';

describe('CorporateActionTelemetry', () => {
  let telemetry: CorporateActionTelemetry;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    telemetry = new CorporateActionTelemetry();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('emitDetectRunSummary', () => {
    it('logs structured event with no user identifiers', () => {
      telemetry.emitDetectRunSummary({
        enqueuedCount: 10,
        symbolsTotal: 15,
        zeroIncluded: true
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(logSpy.mock.calls[0][0]);

      expect(logged).toEqual({
        enqueuedCount: 10,
        event: 'corporate_action.detect.run_summary',
        symbolsTotal: 15,
        zeroIncluded: true
      });

      expect(JSON.stringify(logged)).not.toMatch(/user|account|holder/i);
    });
  });

  describe('emitDetectSymbolCompleted', () => {
    it('logs event ID, symbol and event count only', () => {
      telemetry.emitDetectSymbolCompleted({
        eventId: 'evt-123',
        eventsDetected: 3,
        symbol: 'AAPL'
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(logSpy.mock.calls[0][0]);

      expect(logged).toEqual({
        event: 'corporate_action.detect.symbol_completed',
        eventId: 'evt-123',
        eventsDetected: 3,
        symbol: 'AAPL'
      });
    });

    it('allows eventId to be undefined', () => {
      telemetry.emitDetectSymbolCompleted({
        eventsDetected: 0,
        symbol: 'NVDA'
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(logSpy.mock.calls[0][0]);

      expect(logged.eventId).toBeUndefined();
      expect(logged.symbol).toBe('NVDA');
    });
  });

  describe('emitDetectSymbolFailed', () => {
    it('logs error with symbol and error code only', () => {
      telemetry.emitDetectSymbolFailed({
        errorCode: 'PROVIDER_ERROR',
        symbol: 'TSLA'
      });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(errorSpy.mock.calls[0][0]);

      expect(logged).toEqual({
        errorCode: 'PROVIDER_ERROR',
        event: 'corporate_action.detect.symbol_failed',
        symbol: 'TSLA'
      });
    });
  });

  describe('emitApplyStarted', () => {
    it('logs event ID, symbol and type', () => {
      telemetry.emitApplyStarted({
        eventId: 'evt-456',
        symbol: 'MSFT',
        type: 'SPLIT'
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(logSpy.mock.calls[0][0]);

      expect(logged).toEqual({
        event: 'corporate_action.apply.started',
        eventId: 'evt-456',
        symbol: 'MSFT',
        type: 'SPLIT'
      });
    });
  });

  describe('emitApplyCompleted', () => {
    it('logs all counts, status and timing without user data', () => {
      telemetry.emitApplyCompleted({
        appliedCount: 5,
        durationMs: 1234,
        eventId: 'evt-789',
        failedCount: 1,
        skippedCount: 2,
        status: 'APPLIED',
        symbol: 'GOOG',
        type: 'DIVIDEND'
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(logSpy.mock.calls[0][0]);

      expect(logged).toEqual({
        appliedCount: 5,
        durationMs: 1234,
        event: 'corporate_action.apply.completed',
        eventId: 'evt-789',
        failedCount: 1,
        skippedCount: 2,
        status: 'APPLIED',
        symbol: 'GOOG',
        type: 'DIVIDEND'
      });

      expect(JSON.stringify(logged)).not.toMatch(/user|account|holder/i);
    });
  });

  describe('emitApplyFailed', () => {
    it('logs error with event ID, symbol, type and error code', () => {
      telemetry.emitApplyFailed({
        errorCode: 'ACCOUNT_RESOLUTION_FAILED',
        eventId: 'evt-999',
        symbol: 'AMZN',
        type: 'MERGER'
      });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(errorSpy.mock.calls[0][0]);

      expect(logged).toEqual({
        errorCode: 'ACCOUNT_RESOLUTION_FAILED',
        event: 'corporate_action.apply.failed',
        eventId: 'evt-999',
        symbol: 'AMZN',
        type: 'MERGER'
      });
    });
  });

  describe('emitRecomputeRequested', () => {
    it('logs event ID and symbol only', () => {
      telemetry.emitRecomputeRequested({
        eventId: 'evt-abc',
        symbol: 'META'
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(logSpy.mock.calls[0][0]);

      expect(logged).toEqual({
        event: 'corporate_action.recompute.requested',
        eventId: 'evt-abc',
        symbol: 'META'
      });
    });
  });

  it('never logs user identifiers in any event', () => {
    telemetry.emitDetectRunSummary({
      enqueuedCount: 1,
      symbolsTotal: 1,
      zeroIncluded: false
    });
    telemetry.emitDetectSymbolCompleted({
      eventId: 'e1',
      eventsDetected: 1,
      symbol: 'S'
    });
    telemetry.emitDetectSymbolFailed({ errorCode: 'ERR', symbol: 'S' });
    telemetry.emitApplyStarted({ eventId: 'e1', symbol: 'S', type: 'T' });
    telemetry.emitApplyCompleted({
      appliedCount: 1,
      durationMs: 100,
      eventId: 'e1',
      failedCount: 0,
      skippedCount: 0,
      status: 'APPLIED',
      symbol: 'S',
      type: 'T'
    });
    telemetry.emitApplyFailed({
      errorCode: 'ERR',
      eventId: 'e1',
      symbol: 'S',
      type: 'T'
    });
    telemetry.emitRecomputeRequested({ eventId: 'e1', symbol: 'S' });

    const allLogs = [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((call) => call[0])
      .join(' ');

    expect(allLogs).not.toMatch(/user|account|holder|userId|accountId/i);
  });
});
