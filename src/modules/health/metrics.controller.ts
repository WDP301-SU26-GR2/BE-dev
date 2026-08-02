import { Controller, Get, Res, UseGuards } from '@nestjs/common'
import { ApiHeader, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { IsPublic } from 'src/core/security/decorators/auth.decorator'
import { METRICS_API_KEY_HEADER, MetricsApiKeyGuard } from './guards/metrics-api-key.guard'
import { MetricsService } from './metrics.service'

@ApiTags('health')
@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics')
  @IsPublic()
  @UseGuards(MetricsApiKeyGuard)
  @ApiProduces('text/plain')
  @ApiHeader({
    name: METRICS_API_KEY_HEADER,
    required: true,
    description: 'API key for the Prometheus scraper'
  })
  @ApiOperation({ summary: 'Prometheus runtime metrics without identity or IP labels' })
  async metricsText(@Res() response: Response): Promise<void> {
    response.type('text/plain; version=0.0.4; charset=utf-8').send(await this.metrics.render())
  }
}
