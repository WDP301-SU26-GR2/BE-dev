import { Injectable } from '@nestjs/common'
import { RuntimeMetricsService } from 'src/core/observability/runtime-metrics.service'
import { RuntimeSystemMetricsService } from 'src/core/observability/runtime-system-metrics.service'
import { QueueDepthMetricsService } from 'src/infrastructure/queue/queue-depth-metrics.service'

@Injectable()
export class MetricsService {
  constructor(
    private readonly metrics: RuntimeMetricsService,
    private readonly queueDepth: QueueDepthMetricsService,
    private readonly systemMetrics: RuntimeSystemMetricsService
  ) {}

  async render(): Promise<string> {
    await this.queueDepth.sample()
    this.systemMetrics.sample()
    return this.metrics.renderPrometheus()
  }
}
