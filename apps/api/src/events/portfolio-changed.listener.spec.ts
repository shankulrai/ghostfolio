import { Logger } from '@nestjs/common';

import { PortfolioChangedEvent } from './portfolio-changed.event';
import { PortfolioChangedListener } from './portfolio-changed.listener';

describe('PortfolioChangedListener', () => {
  let listener: PortfolioChangedListener;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let mockApiService: any;
  let mockPortfolioSnapshotService: any;
  let mockRedisCacheService: any;
  let mockUserService: any;

  beforeEach(() => {
    mockApiService = {
      buildFiltersFromUserSettings: jest.fn().mockReturnValue([])
    };

    mockPortfolioSnapshotService = {
      addJobToQueue: jest.fn().mockResolvedValue(undefined)
    };

    mockRedisCacheService = {
      getPortfolioSnapshotKey: jest.fn().mockReturnValue('cache-key'),
      removePortfolioSnapshotsByUserId: jest.fn().mockResolvedValue(undefined)
    };

    mockUserService = {
      user: jest.fn().mockResolvedValue({
        id: 'user-123',
        settings: {
          settings: {
            baseCurrency: 'USD',
            performanceCalculationType: 'ROAI'
          }
        }
      })
    };

    listener = new PortfolioChangedListener(
      mockApiService,
      mockPortfolioSnapshotService,
      mockRedisCacheService,
      mockUserService
    );

    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs portfolio change without user identifier', (done) => {
    const event = new PortfolioChangedEvent({ userId: 'user-123' });

    listener.handlePortfolioChangedEvent(event);

    setTimeout(() => {
      expect(logSpy).toHaveBeenCalled();

      const allLogs = logSpy.mock.calls.map((call) => call[0]).join(' ');

      expect(allLogs).toContain('Portfolio has changed');
      expect(allLogs).not.toMatch(/user-123|userId|user '/i);

      done();
    }, 6000);
  }, 10000);

  it('logs error without user identifier when recompute fails', (done) => {
    mockUserService.user.mockResolvedValue({
      id: 'user-456',
      settings: {
        settings: {
          baseCurrency: 'EUR',
          performanceCalculationType: 'TWR'
        }
      }
    });

    mockPortfolioSnapshotService.addJobToQueue.mockRejectedValue(
      new Error('Queue full')
    );

    const event = new PortfolioChangedEvent({ userId: 'user-456' });

    listener.handlePortfolioChangedEvent(event);

    setTimeout(() => {
      expect(errorSpy).toHaveBeenCalled();

      const allErrors = errorSpy.mock.calls.map((call) => call[0]).join(' ');

      expect(allErrors).toContain('Portfolio snapshot could not be recomputed');
      expect(allErrors).not.toMatch(/user-456|userId|user '/i);

      done();
    }, 6000);
  }, 10000);
});
