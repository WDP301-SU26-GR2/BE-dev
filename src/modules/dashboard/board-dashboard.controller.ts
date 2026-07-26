import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { BoardDashboardResDto } from './dto/dashboard.dto'
import { BoardDashboardFacade } from './services/dashboard.facades'

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class BoardDashboardController {
  constructor(private readonly facade: BoardDashboardFacade) {}

  @Get('board')
  @ApiOperation({ summary: 'Dashboard Board: pending decisions + upcoming sessions + at-risk severe' })
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: BoardDashboardResDto })
  board(@ActiveUser('userId') userId: string) {
    return this.facade.build(userId)
  }
}
