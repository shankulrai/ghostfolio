import { ConfigurationService } from '@ghostfolio/api/services/configuration/configuration.service';

import { Injectable, CanActivate } from '@nestjs/common';

/**
 * Gates multi-currency routes behind the ENABLE_FEATURE_MULTI_CURRENCY flag.
 * REQ-020: Feature flag for gradual rollout
 */
@Injectable()
export class MultiCurrencyFeatureGuard implements CanActivate {
  public constructor(
    private readonly configurationService: ConfigurationService
  ) {}

  public canActivate(): boolean {
    return this.configurationService.get('ENABLE_FEATURE_MULTI_CURRENCY');
  }
}
