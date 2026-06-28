import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import {
  ChapterListResDto,
  ChapterResDto,
  CreateChapterBodyDto,
  CreatePageBodyDto,
  ExtendDeadlineBodyDto,
  PageListResDto,
  PageResDto,
  ReasonBodyDto,
  SetScheduleBodyDto,
  UpdatePageBodyDto
} from './dto/chapter.dto'
import {
  ChapterNotFoundException,
  ContractNotExecutedException,
  DuplicateChapterNumberException,
  InvalidManuscriptTransitionException,
  InvalidPageTransitionException,
  NameNotApprovedException,
  NameNotInSeriesException,
  NotSeriesEditorException,
  NotSeriesOwnerException,
  PageNotFoundException,
  PagesNotAllCompletedException
} from './errors/chapter.errors'
import { ChapterService } from './chapter.service'

@ApiTags('chapters')
@ApiBearerAuth()
@Controller()
export class ChapterController {
  constructor(private readonly chapterService: ChapterService) {}

  @Post('chapters')
  @ApiOperation({ summary: 'Mangaka tạo Chapter từ Name APPROVED → Chapter + Manuscript(DRAFT) + Schedule' })
  @ApiErrors(
    NotSeriesOwnerException,
    ChapterNotFoundException,
    DuplicateChapterNumberException,
    NameNotInSeriesException,
    NameNotApprovedException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: ChapterResDto })
  create(@Body() body: CreateChapterBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.create(userId, body)
  }

  @Get('chapters')
  @ApiOperation({ summary: 'List chapter theo seriesId (query)' })
  @ZodResponse({ status: 200, type: ChapterListResDto })
  listBySeries(@Query('seriesId') seriesId: string) {
    return this.chapterService.listBySeries(seriesId)
  }

  @Get('chapters/:id')
  @ApiOperation({ summary: 'Chi tiết 1 chapter (kèm manuscript/schedule)' })
  @ApiErrors(ChapterNotFoundException)
  @ZodResponse({ status: 200, type: ChapterResDto })
  getOne(@Param('id') id: string) {
    return this.chapterService.getOne(id)
  }

  @Put('chapters/:id/schedule')
  @ApiOperation({ summary: 'Editor phụ trách set deadline gốc/hiện tại của chapter' })
  @ApiErrors(NotSeriesEditorException, ChapterNotFoundException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: ChapterResDto })
  setSchedule(@Param('id') id: string, @Body() body: SetScheduleBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.setSchedule(userId, id, body)
  }

  @Patch('chapters/:id/schedule/extend')
  @ApiOperation({ summary: 'Editor gia hạn deadline → tạo ScheduleExtension (previous/new/reason), set extended=true' })
  @ApiErrors(NotSeriesEditorException, ChapterNotFoundException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: ChapterResDto })
  extend(@Param('id') id: string, @Body() body: ExtendDeadlineBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.extendDeadline(userId, id, body)
  }

  @Post('chapters/:id/pages')
  @ApiOperation({ summary: 'Mangaka upload trang (pencil/ink) → tạo Page (NOT_STARTED)' })
  @ApiErrors(NotSeriesOwnerException, ChapterNotFoundException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: PageResDto })
  createPage(@Param('id') id: string, @Body() body: CreatePageBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.createPage(userId, id, body)
  }

  @Get('chapters/:id/pages')
  @ApiOperation({ summary: 'List trang của chapter' })
  @ZodResponse({ status: 200, type: PageListResDto })
  listPages(@Param('id') id: string) {
    return this.chapterService.listPages(id)
  }

  @Patch('pages/:pageId')
  @ApiOperation({ summary: 'Mangaka cập nhật trang (file/status: NOT_STARTED→IN_PROGRESS→COMPOSITE_READY→COMPLETED)' })
  @ApiErrors(NotSeriesOwnerException, PageNotFoundException, InvalidPageTransitionException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: PageResDto })
  updatePage(@Param('pageId') pageId: string, @Body() body: UpdatePageBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.updatePage(userId, pageId, body)
  }

  @Post('chapters/:id/manuscript/mark-composite-ready')
  @ApiOperation({ summary: 'Mangaka chốt composite (cần tất cả trang COMPLETED) → Manuscript sang COMPOSITE_REVIEW' })
  @ApiErrors(
    NotSeriesOwnerException,
    ChapterNotFoundException,
    PagesNotAllCompletedException,
    InvalidManuscriptTransitionException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: ChapterResDto })
  markCompositeReady(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.markCompositeReady(userId, id)
  }

  @Post('chapters/:id/manuscript/submit')
  @ApiOperation({ summary: 'Mangaka nộp manuscript cho Editor final check → EDITOR_REVIEW' })
  @ApiErrors(NotSeriesOwnerException, ChapterNotFoundException, InvalidManuscriptTransitionException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: ChapterResDto })
  submit(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.submit(userId, id)
  }

  @Post('chapters/:id/manuscript/request-revision')
  @ApiOperation({ summary: 'Editor yêu cầu sửa manuscript → EDITOR_REVISION (kèm Annotation)' })
  @ApiErrors(NotSeriesEditorException, ChapterNotFoundException, InvalidManuscriptTransitionException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: ChapterResDto })
  requestRevision(@Param('id') id: string, @Body() body: ReasonBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.requestRevision(userId, id, body.reason)
  }

  @Post('chapters/:id/manuscript/resubmit')
  @ApiOperation({ summary: 'Mangaka nộp lại sau revision → EDITOR_REVIEW' })
  @ApiErrors(NotSeriesOwnerException, ChapterNotFoundException, InvalidManuscriptTransitionException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: ChapterResDto })
  resubmit(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.resubmit(userId, id)
  }

  @Post('chapters/:id/manuscript/approve')
  @ApiOperation({ summary: 'Editor duyệt manuscript → READY_FOR_PRINT' })
  @ApiErrors(NotSeriesEditorException, ChapterNotFoundException, InvalidManuscriptTransitionException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: ChapterResDto })
  approve(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.approve(userId, id)
  }

  @Post('chapters/:id/publish')
  @ApiOperation({
    summary:
      'Editor xuất bản chapter (chỉ READY_FOR_PRINT) → PUBLISHED + emit chapter.published. Co-owner/Contract gate: defer B1/B3.'
  })
  @ApiErrors(
    NotSeriesEditorException,
    ChapterNotFoundException,
    InvalidManuscriptTransitionException,
    ContractNotExecutedException
  )
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: ChapterResDto })
  publish(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.publish(userId, id)
  }
}
