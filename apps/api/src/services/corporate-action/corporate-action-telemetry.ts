import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CorporateActionTelemetry {
  private readonly logger = new Logger(CorporateActionTelemetry.name);

  public emitDetectRunSummary({
    enqueuedCount,
    symbolsTotal,
    zeroIncluded
  }: {
    enqueuedCount: number;
    symbolsTotal: number;
    zeroIncluded: boolean;
  }): void {
    this.logger.log(
      JSON.stringify({
        enqueuedCount,
        event: 'corporate_action.detect.run_summary',
        symbolsTotal,
        zeroIncluded
      })
    );
  }

  public emitDetectSymbolCompleted({
    eventId,
    eventsDetected,
    symbol
  }: {
    eventId?: string;
    eventsDetected: number;
    symbol: string;
  }): void {
    this.logger.log(
      JSON.stringify({
        event: 'corporate_action.detect.symbol_completed',
        eventId,
        eventsDetected,
        symbol
      })
    );
  }

  public emitDetectSymbolFailed({
    errorCode,
    symbol
  }: {
    errorCode: string;
    symbol: string;
  }): void {
    this.logger.error(
      JSON.stringify({
        errorCode,
        event: 'corporate_action.detect.symbol_failed',
        symbol
      })
    );
  }

  public emitApplyStarted({
    eventId,
    symbol,
    type
  }: {
    eventId: string;
    symbol: string;
    type: string;
  }): void {
    this.logger.log(
      JSON.stringify({
        event: 'corporate_action.apply.started',
        eventId,
        symbol,
        type
      })
    );
  }

  public emitApplyCompleted({
    appliedCount,
    durationMs,
    eventId,
    failedCount,
    skippedCount,
    status,
    symbol,
    type
  }: {
    appliedCount: number;
    durationMs: number;
    eventId: string;
    failedCount: number;
    skippedCount: number;
    status: string;
    symbol: string;
    type: string;
  }): void {
    this.logger.log(
      JSON.stringify({
        appliedCount,
        durationMs,
        event: 'corporate_action.apply.completed',
        eventId,
        failedCount,
        skippedCount,
        status,
        symbol,
        type
      })
    );
  }

  public emitApplyFailed({
    errorCode,
    eventId,
    symbol,
    type
  }: {
    errorCode: string;
    eventId: string;
    symbol: string;
    type: string;
  }): void {
    this.logger.error(
      JSON.stringify({
        errorCode,
        event: 'corporate_action.apply.failed',
        eventId,
        symbol,
        type
      })
    );
  }

  public emitRecomputeRequested({
    eventId,
    symbol
  }: {
    eventId: string;
    symbol: string;
  }): void {
    this.logger.log(
      JSON.stringify({
        event: 'corporate_action.recompute.requested',
        eventId,
        symbol
      })
    );
  }
}
