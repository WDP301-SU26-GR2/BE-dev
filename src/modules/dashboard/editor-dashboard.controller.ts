import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { EditorDashboardResDto } from './dto/dashboard.dto'
import { EditorDashboardFacade } from './services/dashboard.facades'

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class EditorDashboardController {
  constructor(private readonly facade: EditorDashboardFacade) {}

  @Get('editor')
  @ApiOperation({
    summary: 'Dashboard Editor: series overview + review queue + at-risk + production alerts + pending contracts'
  })
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: EditorDashboardResDto })
  editor(@ActiveUser('userId') userId: string) {
    return this.facade.build(userId)
  }
}
