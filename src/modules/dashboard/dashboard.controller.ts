import { Controller, Get } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import {
  AdminDashboardResDto,
  AssistantDashboardResDto,
  BoardDashboardResDto,
  EditorDashboardResDto,
  MangakaDashboardResDto,
  MangakaEarningsResDto
} from './dto/dashboard.dto'
import { AdminDashboardService } from './services/admin-dashboard.service'
import { AssistantDashboardService } from './services/assistant-dashboard.service'
import { BoardDashboardService } from './services/board-dashboard.service'
import { EditorDashboardService } from './services/editor-dashboard.service'
import { MangakaDashboardService } from './services/mangaka-dashboard.service'
import { MangakaEarningsService } from './services/mangaka-earnings.service'

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly mangakaDashboard: MangakaDashboardService,
    private readonly mangakaEarnings: MangakaEarningsService,
    private readonly assistantDashboard: AssistantDashboardService,
    private readonly editorDashboard: EditorDashboardService,
    private readonly boardDashboard: BoardDashboardService,
    private readonly adminDashboard: AdminDashboardService
  ) {}

  @Get('mangaka')
  @ApiOperation({ summary: 'Dashboard Mangaka: studio + rankings + unread + openRevisions' })
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: MangakaDashboardResDto })
  mangaka(@ActiveUser('userId') userId: string) {
    return this.mangakaDashboard.build(userId)
  }

  @Get('mangaka/earnings')
  @ApiOperation({ summary: 'Thu nhập Mangaka (PaymentRecord tổng hợp)' })
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: MangakaEarningsResDto })
  earnings(@ActiveUser('userId') userId: string) {
    return this.mangakaEarnings.build(userId)
  }

  @Get('assistant')
  @ApiOperation({ summary: 'Dashboard Assistant: workload + assignments + reputation' })
  @Roles(RoleName.ASSISTANT)
  @ZodResponse({ status: 200, type: AssistantDashboardResDto })
  assistant(@ActiveUser('userId') userId: string) {
    return this.assistantDashboard.build(userId)
  }

  @Get('editor')
  @ApiOperation({
    summary: 'Dashboard Editor: series overview + review queue + at-risk + production alerts + pending contracts'
  })
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: EditorDashboardResDto })
  editor(@ActiveUser('userId') userId: string) {
    return this.editorDashboard.build(userId)
  }

  @Get('board')
  @ApiOperation({ summary: 'Dashboard Board: pending decisions + upcoming sessions + at-risk severe' })
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: BoardDashboardResDto })
  board(@ActiveUser('userId') userId: string) {
    return this.boardDashboard.build(userId)
  }

  @Get('admin')
  @ApiOperation({ summary: 'Dashboard Admin: system stats + unread' })
  @Roles(RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: AdminDashboardResDto })
  admin(@ActiveUser('userId') userId: string) {
    return this.adminDashboard.build(userId)
  }
}
