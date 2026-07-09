import { Body, Controller, Get, Param, Put, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import { NameService } from './name.service'
import {
  AddNamePageBodyDto,
  ListNamesQueryDto,
  NameListResDto,
  NameResDto,
  ReasonBodyDto,
  UpdateNamePagesBodyDto
} from './dto/name.dto'
import {
  InvalidNameStateException,
  NameNotFoundException,
  NotAssignedEditorException,
  NotSeriesOwnerException,
  SeriesAccessDeniedException,
  SeriesNotFoundException
} from './errors/name.errors'

// Spec 8 §4: base path 'series/:id/names'. Toàn bộ route Name (lifecycle + reads + chapter-Name create)
// sống ở đây — series controller chỉ còn series/proposal/pitch/claim/lifecycle.
@ApiTags('names')
@ApiBearerAuth()
@Controller('series/:id/names')
export class NameController {
  constructor(private readonly nameService: NameService) {}

  // ── Reads (cả 2 kind) ────────────────────────────────────────────────────
  @Get()
  @ApiOperation({ summary: 'List Name của series (filter kind PROPOSAL|CHAPTER)' })
  @ApiErrors(SeriesNotFoundException, SeriesAccessDeniedException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: NameListResDto })
  list(
    @Param('id') id: string,
    @Query() query: ListNamesQueryDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.nameService.listNames({ userId, roleName }, id, query.kind)
  }

  @Get(':nameId')
  @ApiOperation({ summary: 'Chi tiết 1 Name' })
  @ApiErrors(SeriesNotFoundException, SeriesAccessDeniedException, NameNotFoundException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: NameResDto })
  getOne(
    @Param('id') id: string,
    @Param('nameId') nameId: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.nameService.getName({ userId, roleName }, id, nameId)
  }

  // ── Lifecycle (DRY cho cả PROPOSAL + CHAPTER) ────────────────────────────
  @Post(':nameId/request-revision')
  @ApiOperation({ summary: 'Editor phụ trách yêu cầu sửa Name → REVISION' })
  @ApiErrors(NotAssignedEditorException, SeriesNotFoundException, InvalidNameStateException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: NameResDto })
  requestRevision(
    @Param('id') id: string,
    @Param('nameId') nameId: string,
    @Body() body: ReasonBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.nameService.requestRevision(userId, id, nameId, body.reason)
  }

  @Post(':nameId/resubmit')
  @ApiOperation({ summary: 'Mangaka nộp lại Name sau revision → IN_REVIEW, version++' })
  @ApiErrors(NotSeriesOwnerException, InvalidNameStateException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: NameResDto })
  resubmit(@Param('id') id: string, @Param('nameId') nameId: string, @ActiveUser('userId') userId: string) {
    return this.nameService.resubmit(userId, id, nameId)
  }

  @Post(':nameId/approve')
  @ApiOperation({
    summary: 'Editor duyệt Name → APPROVED (proposal-Name → emit → Series READY_TO_PITCH)'
  })
  @ApiErrors(NotAssignedEditorException, SeriesNotFoundException, InvalidNameStateException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: NameResDto })
  approve(@Param('id') id: string, @Param('nameId') nameId: string, @ActiveUser('userId') userId: string) {
    return this.nameService.approve(userId, id, nameId)
  }

  // ── Pages (chỉ DRAFT/REVISION) ──────────────────────────────────────────
  @Put(':nameId/pages')
  @ApiOperation({ summary: 'Mangaka thay TOÀN BỘ trang Name (chỉ DRAFT/REVISION)' })
  @ApiErrors(NotSeriesOwnerException, SeriesNotFoundException, InvalidNameStateException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: NameResDto })
  updatePages(
    @Param('id') id: string,
    @Param('nameId') nameId: string,
    @Body() body: UpdateNamePagesBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.nameService.updatePages(userId, id, nameId, body)
  }

  @Post(':nameId/pages')
  @ApiOperation({ summary: 'Mangaka thêm 1 trang Name (append; chỉ DRAFT/REVISION)' })
  @ApiErrors(NotSeriesOwnerException, SeriesNotFoundException, InvalidNameStateException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: NameResDto })
  addPage(
    @Param('id') id: string,
    @Param('nameId') nameId: string,
    @Body() body: AddNamePageBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.nameService.addPage(userId, id, nameId, body)
  }
}
