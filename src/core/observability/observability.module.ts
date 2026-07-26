import { Global, Module } from '@nestjs/common'
import { CronMetricsService } from './cron-metrics.service'
import { RuntimeMetricsService } from './runtime-metrics.service'
import { RuntimeSystemMetricsService } from './runtime-system-metrics.service'

@Global()
@Module({
  providers: [RuntimeMetricsService, RuntimeSystemMetricsService, CronMetricsService],
  exports: [RuntimeMetricsService, RuntimeSystemMetricsService, CronMetricsService]
})
export class ObservabilityModule {}
