import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { MangakaDashboardResDto, MangakaEarningsResDto } from './dto/dashboard.dto'
import { MangakaDashboardFacade } from './services/mangaka-dashboard.facade'

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class MangakaDashboardController {
  constructor(private readonly facade: MangakaDashboardFacade) {}

  @Get('mangaka')
  @ApiOperation({ summary: 'Dashboard Mangaka: studio + rankings + unread + openRevisions' })
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: MangakaDashboardResDto })
  mangaka(@ActiveUser('userId') userId: string) {
    return this.facade.build(userId)
  }

  @Get('mangaka/earnings')
  @ApiOperation({ summary: 'Thu nhập Mangaka (PaymentRecord tổng hợp)' })
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: MangakaEarningsResDto })
  earnings(@ActiveUser('userId') userId: string) {
    return this.facade.earnings(userId)
  }
}
