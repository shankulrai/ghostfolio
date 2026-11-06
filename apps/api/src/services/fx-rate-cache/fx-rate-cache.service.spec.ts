import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';
import { RedisCacheService } from '@ghostfolio/api/services/redis-cache/redis-cache.service';

import { Test, TestingModule } from '@nestjs/testing';

import { FxRateCacheService } from './fx-rate-cache.service';

describe('FxRateCacheService', () => {
  let service: FxRateCacheService;
  let configurationService: { get: jest.Mock };
  let redisCacheService: {
    get: jest.Mock;
    getKeys: jest.Mock;
    remove: jest.Mock;
    set: jest.Mock;
  };

  beforeEach(async () => {
    redisCacheService = {
      get: jest.fn(),
      getKeys: jest.fn(),
      remove: jest.fn(),
      set: jest.fn()
    };

    configurationService = { get: jest.fn().mockReturnValue(false) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FxRateCacheService,
        { provide: ConfigurationService, useValue: configurationService },
        { provide: RedisCacheService, useValue: redisCacheService }
      ]
    }).compile();

    service = module.get(FxRateCacheService);
  });

  describe('getCachedRate', () => {
    it('should return the cached rate when present', async () => {
      redisCacheService.get.mockResolvedValue(1.08);

      const rate = await service.getCachedRate(
        'EURUSD',
        new Date('2024-01-15')
      );

      expect(rate).toBe(1.08);
      expect(redisCacheService.get).toHaveBeenCalledWith(
        'fx:rate:EURUSD:2024-01-15'
      );
    });

    it('should return null on cache miss', async () => {
      redisCacheService.get.mockResolvedValue(undefined);

      const rate = await service.getCachedRate(
        'EURUSD',
        new Date('2024-01-15')
      );

      expect(rate).toBeNull();
    });

    it('should return null and not throw when Redis read fails', async () => {
      redisCacheService.get.mockRejectedValue(new Error('connection refused'));

      const rate = await service.getCachedRate(
        'EURUSD',
        new Date('2024-01-15')
      );

      expect(rate).toBeNull();
    });
  });

  describe('setCachedRate', () => {
    it('should store the rate with the default 24 hour TTL in milliseconds', async () => {
      await service.setCachedRate('EURUSD', new Date('2024-01-15'), 1.08);

      expect(redisCacheService.set).toHaveBeenCalledWith(
        'fx:rate:EURUSD:2024-01-15',
        '1.08',
        86400 * 1000
      );
    });

    it('should use the provided TTL when given', async () => {
      await service.setCachedRate(
        'EURUSD',
        new Date('2024-01-15'),
        1.08,
        60_000
      );

      expect(redisCacheService.set).toHaveBeenCalledWith(
        'fx:rate:EURUSD:2024-01-15',
        '1.08',
        60_000
      );
    });

    it('should not throw when Redis write fails', async () => {
      redisCacheService.set.mockRejectedValue(new Error('timeout'));

      await expect(
        service.setCachedRate('EURUSD', new Date('2024-01-15'), 1.08)
      ).resolves.toBeUndefined();
    });
  });

  describe('provider outage state', () => {
    it('should record the outage start on the first failure only', async () => {
      redisCacheService.get.mockResolvedValue(undefined);

      await service.markProviderFailure();

      expect(redisCacheService.set).toHaveBeenCalledWith(
        'fx:provider:failing-since',
        expect.any(String),
        86400 * 1000
      );
    });

    it('should keep an existing outage start on repeated failures', async () => {
      redisCacheService.get.mockResolvedValue(String(Date.now() - 60_000));

      await service.markProviderFailure();

      expect(redisCacheService.set).not.toHaveBeenCalled();
    });

    it('should clear the outage state on success', async () => {
      await service.markProviderSuccess();

      expect(redisCacheService.remove).toHaveBeenCalledWith(
        'fx:provider:failing-since'
      );
    });

    it('should report unavailable when the kill switch is set', async () => {
      configurationService.get.mockReturnValue(true);

      await expect(service.isProviderUnavailable()).resolves.toBe(true);
    });

    it('should report unavailable after 5 minutes of continuous failure', async () => {
      redisCacheService.get.mockResolvedValue(
        String(Date.now() - 5 * 60_000 - 1000)
      );

      await expect(service.isProviderUnavailable()).resolves.toBe(true);
    });

    it('should stay available before 5 minutes of continuous failure', async () => {
      redisCacheService.get.mockResolvedValue(String(Date.now() - 60_000));

      await expect(service.isProviderUnavailable()).resolves.toBe(false);
    });

    it('should stay available when no failure is recorded', async () => {
      redisCacheService.get.mockResolvedValue(undefined);

      await expect(service.isProviderUnavailable()).resolves.toBe(false);
    });
  });

  describe('invalidateCache', () => {
    it('should remove all cached dates for the currency pair', async () => {
      redisCacheService.getKeys.mockResolvedValue([
        'fx:rate:EURUSD:2024-01-15',
        'fx:rate:EURUSD:2024-01-16'
      ]);

      await service.invalidateCache('EURUSD');

      expect(redisCacheService.getKeys).toHaveBeenCalledWith('fx:rate:EURUSD:');
      expect(redisCacheService.remove).toHaveBeenCalledTimes(2);
      expect(redisCacheService.remove).toHaveBeenCalledWith(
        'fx:rate:EURUSD:2024-01-15'
      );
    });

    it('should not remove anything when no keys exist for the pair', async () => {
      redisCacheService.getKeys.mockResolvedValue([]);

      await service.invalidateCache('EURUSD');

      expect(redisCacheService.remove).not.toHaveBeenCalled();
    });
  });
});
