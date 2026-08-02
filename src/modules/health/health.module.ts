import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'
import { HealthService } from './health.service'
import { MetricsController } from './metrics.controller'
import { MetricsService } from './metrics.service'
import { MetricsApiKeyGuard } from './guards/metrics-api-key.guard'

@Module({
  controllers: [HealthController, MetricsController],
  providers: [HealthService, MetricsService, MetricsApiKeyGuard]
})
export class HealthModule {}
