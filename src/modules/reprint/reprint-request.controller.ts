import { Controller, Get, Post, Body, Param, Patch, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ReprintRequestFacade } from './services/reprint-request.facade'
import {
  CreateReprintRequestBodyDto,
  MangakaReviewReprintBodyDto,
  BoardApproveReprintBodyDto,
  EditorApproveChapterBodyDto,
  SubmitChapterManuscriptBodyDto,
  AssignReviserBodyDto,
  ReprintRequestListItemDto,
  ReprintRequestResDto,
  ReprintChapterResDto
} from './dto/reprint-request.dto'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ApiObjectIdParams, ObjectIdParamPipe } from 'src/core/http/pipes/object-id-param.pipe'
import { ReprintRequestErrors } from './errors/reprint-request.error'
import type { ActorContext } from './services/reprint-access.policy'

const ReprintRequestIdParamPipe = ObjectIdParamPipe.for(() => ReprintRequestErrors.NotFound())
const ReprintChapterIdParamPipe = ObjectIdParamPipe.for(() => ReprintRequestErrors.ChapterNotFound())

@ApiTags('reprint-requests')
@ApiBearerAuth()
@Controller('reprint-requests')
export class ReprintRequestController {
  constructor(private readonly reprintRequestService: ReprintRequestFacade) {}

  @ApiOperation({ summary: 'Danh sách yêu cầu tái bản (filter status/seriesId, scope theo role)' })
  @Get()
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.MANGAKA, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: [ReprintRequestListItemDto] })
  findAll(
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string,
    @Query('status') status?: string,
    @Query('seriesId') seriesId?: string
  ) {
    return this.reprintRequestService.findAll(userId, roleName, { status, seriesId })
  }

  @ApiOperation({ summary: 'Chi tiết yêu cầu tái bản' })
  @ApiErrors(ReprintRequestErrors.NotFound())
  @Get(':id')
  @ApiObjectIdParams('id')
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.MANGAKA, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  findById(
    @Param('id', ReprintRequestIdParamPipe) id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.reprintRequestService.findById(id, this.actor(userId, roleName))
  }

  @ApiOperation({ summary: 'Danh sách chapter trong yêu cầu tái bản' })
  @ApiErrors(ReprintRequestErrors.NotFound())
  @Get(':id/chapters')
  @ApiObjectIdParams('id')
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.MANGAKA, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: [ReprintChapterResDto] })
  getChapters(
    @Param('id', ReprintRequestIdParamPipe) id: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.reprintRequestService.getChapters(id, this.actor(userId, roleName))
  }

  @ApiOperation({ summary: 'Chi tiết chapter trong yêu cầu tái bản' })
  @ApiErrors(ReprintRequestErrors.NotFound(), ReprintRequestErrors.ChapterNotFound())
  @Get(':id/chapters/:chapterId')
  @ApiObjectIdParams('id', 'chapterId')
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.MANGAKA, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: ReprintChapterResDto })
  getChapterById(
    @Param('id', ReprintRequestIdParamPipe) id: string,
    @Param('chapterId', ReprintChapterIdParamPipe) chapterId: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.reprintRequestService.getChapterById(id, chapterId, this.actor(userId, roleName))
  }

  @ApiOperation({ summary: 'Mangaka cập nhật manuscript cho chapter tái bản' })
  @ApiErrors(
    ReprintRequestErrors.NotFound(),
    ReprintRequestErrors.ChapterNotFound(),
    ReprintRequestErrors.InvalidReprintTransition(),
    ReprintRequestErrors.ActionNotAllowed()
  )
  @Patch(':id/chapters/:chapterId/manuscript')
  @ApiObjectIdParams('id', 'chapterId')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  updateChapterManuscript(
    @Param('id', ReprintRequestIdParamPipe) id: string,
    @Param('chapterId', ReprintChapterIdParamPipe) chapterId: string,
    @Body() dto: SubmitChapterManuscriptBodyDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.reprintRequestService.updateChapterManuscript(id, chapterId, dto, this.actor(userId, roleName))
  }

  @ApiOperation({
    summary: 'Editor duyệt chapter tái bản; auto-publish toàn bộ request khi mọi chapter đạt APPROVED'
  })
  @ApiErrors(
    ReprintRequestErrors.NotFound(),
    ReprintRequestErrors.ChapterNotFound(),
    ReprintRequestErrors.InvalidReprintTransition(),
    ReprintRequestErrors.ActionNotAllowed()
  )
  @Patch(':id/chapters/:chapterId/approve')
  @ApiObjectIdParams('id', 'chapterId')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  approveChapter(
    @Param('id', ReprintRequestIdParamPipe) id: string,
    @Param('chapterId', ReprintChapterIdParamPipe) chapterId: string,
    @Body() dto: EditorApproveChapterBodyDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.reprintRequestService.approveChapter(id, chapterId, dto, this.actor(userId, roleName))
  }

  @ApiOperation({ summary: 'Editor tạo yêu cầu tái bản (B-RPT-01)' })
  @ApiErrors(
    ReprintRequestErrors.ContractNotFound(),
    ReprintRequestErrors.OriginalChaptersNotFound(),
    ReprintRequestErrors.ActionNotAllowed()
  )
  @Post()
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: ReprintRequestResDto })
  create(
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string,
    @Body() dto: CreateReprintRequestBodyDto
  ) {
    return this.reprintRequestService.create(this.actor(userId, roleName), dto)
  }

  @ApiOperation({ summary: 'Mangaka chấp nhận/từ chối yêu cầu tái bản (B-RPT-02)' })
  @ApiErrors(
    ReprintRequestErrors.NotFound(),
    ReprintRequestErrors.ActionNotAllowed(),
    ReprintRequestErrors.InvalidReprintTransition()
  )
  @Patch(':id/mangaka-review')
  @ApiObjectIdParams('id')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  mangakaReview(
    @Param('id', ReprintRequestIdParamPipe) id: string,
    @Body() dto: MangakaReviewReprintBodyDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.reprintRequestService.mangakaReview(id, dto, this.actor(userId, roleName))
  }

  @ApiOperation({ summary: 'Board duyệt/từ chối yêu cầu tái bản (B-RPT-02)' })
  @ApiErrors(
    ReprintRequestErrors.NotFound(),
    ReprintRequestErrors.ContractNotFound(),
    ReprintRequestErrors.InvalidReprintTransition()
  )
  @Patch(':id/board-approve')
  @ApiObjectIdParams('id')
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  boardApprove(
    @Param('id', ReprintRequestIdParamPipe) id: string,
    @Body() dto: BoardApproveReprintBodyDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.reprintRequestService.boardApprove(id, dto, this.actor(userId, roleName))
  }

  @ApiOperation({ summary: 'Gán reviser cho chapter tái bản WITH_REVISION (FULL_BUYOUT) — PB-07' })
  @ApiErrors(
    ReprintRequestErrors.NotFound(),
    ReprintRequestErrors.ChapterNotFound(),
    ReprintRequestErrors.NotWithRevision(),
    ReprintRequestErrors.ReviserOnlyForFullBuyout(),
    ReprintRequestErrors.ReviserMangakaNotFound(),
    ReprintRequestErrors.ActionNotAllowed()
  )
  @Patch(':id/chapters/:chapterId/assign-reviser')
  @ApiObjectIdParams('id', 'chapterId')
  @Roles(RoleName.BOARD_MEMBER, RoleName.EDITOR)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  assignReviser(
    @Param('id', ReprintRequestIdParamPipe) id: string,
    @Param('chapterId', ReprintChapterIdParamPipe) chapterId: string,
    @Body() dto: AssignReviserBodyDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.reprintRequestService.assignReviser(id, chapterId, dto, this.actor(userId, roleName))
  }

  private actor(userId: string, roleName: string): ActorContext {
    return { userId, roleName }
  }
}
