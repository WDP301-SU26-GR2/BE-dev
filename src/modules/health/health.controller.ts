import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { IsPublic } from 'src/core/security/decorators/auth.decorator'
import { HealthResDto } from './dto/health.dto'
import { ServiceNotReadyException } from './errors/health.errors'
import { HealthService } from './health.service'

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @IsPublic()
  @ApiOperation({ summary: 'Process liveness probe without dependency checks' })
  @ZodResponse({ status: 200, type: HealthResDto })
  live() {
    return this.healthService.liveness()
  }

  @Get('ready')
  @IsPublic()
  @ApiOperation({ summary: 'API readiness probe for MongoDB and Redis' })
  @ApiErrors(ServiceNotReadyException)
  @ZodResponse({ status: 200, type: HealthResDto })
  ready() {
    return this.healthService.readiness()
  }
}
