import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';

import { Test, TestingModule } from '@nestjs/testing';

import { MultiCurrencyFeatureGuard } from './multi-currency-feature.guard';

describe('MultiCurrencyFeatureGuard', () => {
  let guard: MultiCurrencyFeatureGuard;
  let configurationService: { get: jest.Mock };

  beforeEach(async () => {
    configurationService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MultiCurrencyFeatureGuard,
        { provide: ConfigurationService, useValue: configurationService }
      ]
    }).compile();

    guard = module.get(MultiCurrencyFeatureGuard);
  });

  it('should allow requests when the feature flag is enabled', () => {
    configurationService.get.mockReturnValue(true);

    expect(guard.canActivate()).toBe(true);
    expect(configurationService.get).toHaveBeenCalledWith(
      'ENABLE_FEATURE_MULTI_CURRENCY'
    );
  });

  it('should block requests when the feature flag is disabled', () => {
    configurationService.get.mockReturnValue(false);

    expect(guard.canActivate()).toBe(false);
  });
});
