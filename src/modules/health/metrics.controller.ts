import { Controller, Get, Res } from '@nestjs/common'
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { IsPublic } from 'src/core/security/decorators/auth.decorator'
import { MetricsService } from './metrics.service'

@ApiTags('health')
@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics')
  @IsPublic()
  @ApiProduces('text/plain')
  @ApiOperation({ summary: 'Prometheus runtime metrics without identity or IP labels', security: [] })
  async metricsText(@Res() response: Response): Promise<void> {
    response.type('text/plain; version=0.0.4; charset=utf-8').send(await this.metrics.render())
  }
}
