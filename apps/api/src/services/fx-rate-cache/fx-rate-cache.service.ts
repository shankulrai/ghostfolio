import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { RedisCacheService } from '@ghostfolio/api/services/redis-cache/redis-cache.service';

import { Injectable, Logger } from '@nestjs/common';
import ms from 'ms';

const FX_PROVIDER_FAILING_SINCE_KEY = 'fx:provider:failing-since';
const FX_PROVIDER_OUTAGE_THRESHOLD_MS = ms('5 minutes');
const FX_PROVIDER_STATE_TTL_MS = ms('1 day');

/**
 * Redis caching layer for FX rates.
 * REQ-015: Cache FX rates with 24-hour TTL
 * REQ-021: Automatic kill switch after a sustained FX provider outage
 * MISS-002: Log cache hit/miss events with structured output for monitoring
 */
@Injectable()
export class FxRateCacheService {
  private readonly logger = new Logger(FxRateCacheService.name);
  private readonly DEFAULT_TTL_MS = 86400 * 1000; // 24 hours (Keyv TTL is in milliseconds)

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly redisCacheService: RedisCacheService
  ) {}

  /**
   * Get cached rate for a currency pair and date.
   * REQ-015, AC-015
   * MISS-002: Logs cache_hit or cache_miss event
   */
  public async getCachedRate(
    currencyPair: string,
    date: Date
  ): Promise<number | null> {
    try {
      const cachedValue = await this.redisCacheService.get(
        this.buildCacheKey(currencyPair, date)
      );

      if (cachedValue) {
        this.logger.log({
          event: 'cache_hit',
          currencyPair,
          date: this.formatDate(date)
        });
        return Number(cachedValue);
      }

      this.logger.log({
        event: 'cache_miss',
        currencyPair,
        date: this.formatDate(date)
      });
      return null;
    } catch (error) {
      this.logger.error(
        { event: 'cache_error', error: error.message, currencyPair },
        error.stack
      );
      return null;
    }
  }

  /**
   * Set cached rate for a currency pair and date.
   * REQ-015, AC-015
   */
  public async setCachedRate(
    currencyPair: string,
    date: Date,
    rate: number,
    ttlMs?: number
  ): Promise<void> {
    try {
      await this.redisCacheService.set(
        this.buildCacheKey(currencyPair, date),
        rate.toString(),
        ttlMs ?? this.DEFAULT_TTL_MS
      );
    } catch (error) {
      this.logger.error(
        { event: 'cache_set_error', error: error.message, currencyPair },
        error.stack
      );
    }
  }

  /**
   * Invalidate cache for a currency pair (all dates).
   * REQ-015
   */
  public async invalidateCache(currencyPair: string): Promise<void> {
    try {
      const keys = await this.redisCacheService.getKeys(
        `fx:rate:${currencyPair}:`
      );

      if (keys.length > 0) {
        for (const key of keys) {
          await this.redisCacheService.remove(key);
        }
        this.logger.log({
          event: 'cache_invalidated',
          currencyPair,
          keysDeleted: keys.length
        });
      }
    } catch (error) {
      this.logger.error(
        { event: 'cache_invalidate_error', error: error.message, currencyPair },
        error.stack
      );
    }
  }

  /**
   * Record a failed FX provider fetch. The outage starts at the first failure.
   * REQ-021, EC-003
   */
  public async markProviderFailure(): Promise<void> {
    try {
      const failingSince = await this.redisCacheService.get(
        FX_PROVIDER_FAILING_SINCE_KEY
      );

      if (failingSince === undefined) {
        await this.redisCacheService.set(
          FX_PROVIDER_FAILING_SINCE_KEY,
          String(Date.now()),
          FX_PROVIDER_STATE_TTL_MS
        );
      }
    } catch (error) {
      this.logger.error({
        event: 'fx_provider_state_error',
        error: error.message
      });
    }
  }

  /**
   * Clear the outage state after a successful FX provider fetch.
   * REQ-021
   */
  public async markProviderSuccess(): Promise<void> {
    try {
      await this.redisCacheService.remove(FX_PROVIDER_FAILING_SINCE_KEY);
    } catch (error) {
      this.logger.error({
        event: 'fx_provider_state_error',
        error: error.message
      });
    }
  }

  /**
   * True when the manual kill switch is set or the provider has failed continuously for 5 minutes.
   * REQ-021, AC-021, EC-003
   */
  public async isProviderUnavailable(): Promise<boolean> {
    if (this.configurationService.get('FX_PROVIDER_KILL_SWITCH')) {
      return true;
    }

    try {
      const failingSince = await this.redisCacheService.get(
        FX_PROVIDER_FAILING_SINCE_KEY
      );

      return (
        failingSince !== undefined &&
        Date.now() - Number(failingSince) >= FX_PROVIDER_OUTAGE_THRESHOLD_MS
      );
    } catch (error) {
      this.logger.error({
        event: 'fx_provider_state_error',
        error: error.message
      });
      return false;
    }
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private buildCacheKey(currencyPair: string, date: Date): string {
    return `fx:rate:${currencyPair}:${this.formatDate(date)}`;
  }
}
