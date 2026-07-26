import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { AssistantDashboardResDto } from './dto/dashboard.dto'
import { AssistantDashboardFacade } from './services/dashboard.facades'

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class AssistantDashboardController {
  constructor(private readonly facade: AssistantDashboardFacade) {}

  @Get('assistant')
  @ApiOperation({ summary: 'Dashboard Assistant: workload + assignments + reputation' })
  @Roles(RoleName.ASSISTANT)
  @ZodResponse({ status: 200, type: AssistantDashboardResDto })
  assistant(@ActiveUser('userId') userId: string) {
    return this.facade.build(userId)
  }
}
