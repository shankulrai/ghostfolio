import { ConfigurationModule } from '@ghostfolio/api/services/configuration/configuration.module';
import { RedisCacheModule } from '@ghostfolio/api/services/redis-cache/redis-cache.module';

import { Module } from '@nestjs/common';

import { FxRateCacheService } from './fx-rate-cache.service';

@Module({
  imports: [ConfigurationModule, RedisCacheModule],
  providers: [FxRateCacheService],
  exports: [FxRateCacheService]
})
export class FxRateCacheModule {}
