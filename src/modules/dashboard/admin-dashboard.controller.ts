import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { AdminDashboardResDto } from './dto/dashboard.dto'
import { AdminDashboardFacade } from './services/dashboard.facades'

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class AdminDashboardController {
  constructor(private readonly facade: AdminDashboardFacade) {}

  @Get('admin')
  @ApiOperation({ summary: 'Dashboard Admin: system stats + unread' })
  @Roles(RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: AdminDashboardResDto })
  admin(@ActiveUser('userId') userId: string) {
    return this.facade.build(userId)
  }
}
