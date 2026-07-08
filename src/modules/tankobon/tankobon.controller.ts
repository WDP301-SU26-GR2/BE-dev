import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { TankobonService } from './tankobon.service'
import { CreateTankobonSalesBodyDto, TankobonSalesResDto, DefenseDashboardResDto } from './dto/tankobon.dto'
import { TankobonSeriesNotFoundException, DefenseDashboardAccessDeniedException } from './errors/tankobon.errors'

@ApiTags('tankobon')
@ApiBearerAuth()
@Controller()
export class TankobonController {
  constructor(private readonly tankobonService: TankobonService) {}

  @ApiOperation({ summary: 'Nhập doanh số tankobon cho series (Editor/Board) — PB-08' })
  @ApiErrors(TankobonSeriesNotFoundException)
  @Post('tankobon-sales')
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 201, type: TankobonSalesResDto })
  create(@ActiveUser('userId') userId: string, @Body() dto: CreateTankobonSalesBodyDto) {
    return this.tankobonService.recordSales(dto.seriesId, dto, userId)
  }

  @ApiOperation({
    summary: 'Dashboard bảo vệ series: ranking trend + tankobon + reports (Editor phụ trách/Board) — PB-08'
  })
  @ApiErrors(TankobonSeriesNotFoundException, DefenseDashboardAccessDeniedException)
  @Get('series/:id/defense-dashboard')
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: DefenseDashboardResDto })
  dashboard(@Param('id') id: string, @ActiveUser('userId') userId: string, @ActiveUser('roleName') roleName: string) {
    return this.tankobonService.defenseDashboard(id, userId, roleName)
  }
}
