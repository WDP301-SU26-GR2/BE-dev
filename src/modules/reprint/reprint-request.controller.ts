import { Controller, Get, Post, Body, Param, Patch, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ReprintRequestService } from './services/reprint-request.service'
import {
  CreateReprintRequestBodyDto,
  MangakaReviewReprintBodyDto,
  BoardApproveReprintBodyDto,
  EditorApproveChapterBodyDto,
  SubmitChapterManuscriptBodyDto,
  AssignReviserBodyDto,
  ReprintRequestResDto,
  ReprintChapterResDto
} from './dto/reprint-request.dto'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ReprintRequestErrors } from './errors/reprint-request.error'

@ApiTags('reprint-requests')
@ApiBearerAuth()
@Controller('reprint-requests')
export class ReprintRequestController {
  constructor(private readonly reprintRequestService: ReprintRequestService) {}

  @ApiOperation({ summary: 'Danh sách yêu cầu tái bản (filter status/seriesId, scope theo role)' })
  @Get()
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.MANGAKA, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: [ReprintRequestResDto] })
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
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.MANGAKA, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  findById(@Param('id') id: string) {
    return this.reprintRequestService.findById(id)
  }

  @ApiOperation({ summary: 'Danh sách chapter trong yêu cầu tái bản' })
  @ApiErrors(ReprintRequestErrors.NotFound())
  @Get(':id/chapters')
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.MANGAKA, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: [ReprintChapterResDto] })
  getChapters(@Param('id') id: string) {
    return this.reprintRequestService.getChapters(id)
  }

  @ApiOperation({ summary: 'Chi tiết chapter trong yêu cầu tái bản' })
  @ApiErrors(ReprintRequestErrors.NotFound(), ReprintRequestErrors.ChapterNotFound())
  @Get(':id/chapters/:chapterId')
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.MANGAKA, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: ReprintChapterResDto })
  getChapterById(@Param('id') id: string, @Param('chapterId') chapterId: string) {
    return this.reprintRequestService.getChapterById(id, chapterId)
  }

  @ApiOperation({ summary: 'Mangaka cập nhật manuscript cho chapter tái bản' })
  @ApiErrors(
    ReprintRequestErrors.NotFound(),
    ReprintRequestErrors.ChapterNotFound(),
    ReprintRequestErrors.InvalidReprintTransition()
  )
  @Patch(':id/chapters/:chapterId/manuscript')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  updateChapterManuscript(
    @Param('id') id: string,
    @Param('chapterId') chapterId: string,
    @Body() dto: SubmitChapterManuscriptBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.reprintRequestService.updateChapterManuscript(id, chapterId, dto, userId)
  }

  @ApiOperation({
    summary: 'Editor duyệt chapter tái bản; auto-publish toàn bộ request khi mọi chapter đạt APPROVED'
  })
  @ApiErrors(
    ReprintRequestErrors.NotFound(),
    ReprintRequestErrors.ChapterNotFound(),
    ReprintRequestErrors.InvalidReprintTransition()
  )
  @Patch(':id/chapters/:chapterId/approve')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  approveChapter(
    @Param('id') id: string,
    @Param('chapterId') chapterId: string,
    @Body() dto: EditorApproveChapterBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.reprintRequestService.approveChapter(id, chapterId, dto, userId)
  }

  @ApiOperation({ summary: 'Editor tạo yêu cầu tái bản (B-RPT-01)' })
  @ApiErrors(ReprintRequestErrors.ContractNotFound(), ReprintRequestErrors.OriginalChaptersNotFound())
  @Post()
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: ReprintRequestResDto })
  create(@ActiveUser('userId') userId: string, @Body() dto: CreateReprintRequestBodyDto) {
    return this.reprintRequestService.create(userId, dto)
  }

  @ApiOperation({ summary: 'Mangaka chấp nhận/từ chối yêu cầu tái bản (B-RPT-02)' })
  @ApiErrors(
    ReprintRequestErrors.NotFound(),
    ReprintRequestErrors.ActionNotAllowed(),
    ReprintRequestErrors.InvalidReprintTransition()
  )
  @Patch(':id/mangaka-review')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  mangakaReview(
    @Param('id') id: string,
    @Body() dto: MangakaReviewReprintBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.reprintRequestService.mangakaReview(id, dto, userId)
  }

  @ApiOperation({ summary: 'Board duyệt/từ chối yêu cầu tái bản (B-RPT-02)' })
  @ApiErrors(
    ReprintRequestErrors.NotFound(),
    ReprintRequestErrors.ContractNotFound(),
    ReprintRequestErrors.InvalidReprintTransition()
  )
  @Patch(':id/board-approve')
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  boardApprove(@Param('id') id: string, @Body() dto: BoardApproveReprintBodyDto, @ActiveUser('userId') userId: string) {
    return this.reprintRequestService.boardApprove(id, dto, userId)
  }

  @ApiOperation({ summary: 'Gán reviser cho chapter tái bản WITH_REVISION (FULL_BUYOUT) — PB-07' })
  @ApiErrors(
    ReprintRequestErrors.NotFound(),
    ReprintRequestErrors.ChapterNotFound(),
    ReprintRequestErrors.NotWithRevision(),
    ReprintRequestErrors.ReviserOnlyForFullBuyout(),
    ReprintRequestErrors.ReviserMangakaNotFound()
  )
  @Patch(':id/chapters/:chapterId/assign-reviser')
  @Roles(RoleName.BOARD_MEMBER, RoleName.EDITOR)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  assignReviser(
    @Param('id') id: string,
    @Param('chapterId') chapterId: string,
    @Body() dto: AssignReviserBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.reprintRequestService.assignReviser(id, chapterId, dto, userId)
  }
}
