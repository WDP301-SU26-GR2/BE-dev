import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import {
  ChapterListResDto,
  ChapterProgressResDto,
  ChapterResDto,
  CreateChapterBodyDto,
  CreatePageBodyDto,
  DeletePageResDto,
  DeletePagesBulkBodyDto,
  DeletePagesBulkResDto,
  ExtendDeadlineBodyDto,
  HoldChapterBodyDto,
  PageListResDto,
  PageResDto,
  ReasonBodyDto,
  RevisionReasonBodyDto,
  SetScheduleBodyDto,
  UpdateChapterBodyDto,
  UpdatePageBodyDto
} from './dto/chapter.dto'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import {
  ChapterNameNotApprovedException,
  ChapterNotFoundException,
  ChapterNotEditableException,
  ChapterNumberLockedException,
  ChapterNotDeletableException,
  ChapterAccessDeniedException,
  ChapterAlreadyOnHoldException,
  ChapterNotHoldableException,
  ChapterNotOnHoldException,
  ChapterOnHoldException,
  ContractNotExecutedException,
  DuplicateChapterNumberException,
  DuplicatePageNumberException,
  EndingAllowanceExceededException,
  InvalidManuscriptTransitionException,
  NoPagesToSubmitException,
  NotSeriesEditorException,
  NotSeriesOwnerException,
  PageNotFoundException,
  PageNotEditableException,
  PageHasApprovedTasksException,
  RevisionNotResolvedException,
  TasksNotAllApprovedException,
  SeriesNotSerializedException,
  NotCoOwnerException,
  CoOwnerApprovalNotPendingException,
  CoOwnerApprovalNotFoundException
} from './errors/chapter.errors'
import { ChapterService } from './chapter.service'

@ApiTags('chapters')
@ApiBearerAuth()
@Controller()
export class ChapterController {
  constructor(private readonly chapterService: ChapterService) {}

  @Post('chapters')
  @ApiOperation({
    summary:
      'Mangaka tạo Chapter (chapter-first): chapterNumber + title → Chapter(DRAFT) + Manuscript(DRAFT) + Schedule. Name tạo sau.'
  })
  @ApiErrors(
    NotSeriesOwnerException,
    ChapterNotFoundException,
    DuplicateChapterNumberException,
    SeriesNotSerializedException,
    EndingAllowanceExceededException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: ChapterResDto })
  create(@Body() body: CreateChapterBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.create(userId, body)
  }

  @Patch('chapters/:id')
  @ApiOperation({ summary: 'Mangaka sửa title (pre-PUBLISHED) / chapterNumber (chỉ khi DRAFT) — chapter-first' })
  @ApiErrors(
    ChapterNotFoundException,
    NotSeriesOwnerException,
    ChapterNotEditableException,
    ChapterNumberLockedException,
    DuplicateChapterNumberException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: ChapterResDto })
  update(@Param('id') id: string, @Body() body: UpdateChapterBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.updateChapter(userId, id, body)
  }

  @Delete('chapters/:id')
  @ApiOperation({ summary: 'Mangaka xóa chapter DRAFT (cascade Name/Manuscript/Schedule/Pages) — chapter-first' })
  @ApiErrors(ChapterNotFoundException, NotSeriesOwnerException, ChapterNotDeletableException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: MessageResDto })
  remove(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.deleteChapter(userId, id)
  }

  @Get('chapters')
  @ApiOperation({ summary: 'List chapter theo seriesId (query)' })
  @ZodResponse({ status: 200, type: ChapterListResDto })
  listBySeries(@Query('seriesId') seriesId: string) {
    return this.chapterService.listBySeries(seriesId)
  }

  @Get('chapters/:id/progress')
  @ApiOperation({ summary: 'Chapter progress dashboard for owner editor, mangaka, board, or super admin' })
  @ApiErrors(ChapterNotFoundException, ChapterAccessDeniedException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: ChapterProgressResDto })
  progress(@Param('id') id: string, @ActiveUser('userId') userId: string, @ActiveUser('roleName') roleName: string) {
    return this.chapterService.progress({ userId, roleName }, id)
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

  @Post('chapters/:id/hold')
  @ApiOperation({ summary: 'Editor pauses chapter production with hold flag' })
  @ApiErrors(
    ChapterNotFoundException,
    NotSeriesEditorException,
    ChapterNotHoldableException,
    ChapterAlreadyOnHoldException
  )
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: ChapterResDto })
  hold(@Param('id') id: string, @Body() body: HoldChapterBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.hold(userId, id, body)
  }

  @Post('chapters/:id/resume')
  @ApiOperation({ summary: 'Editor resumes a chapter that is on hold' })
  @ApiErrors(ChapterNotFoundException, NotSeriesEditorException, ChapterNotOnHoldException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: ChapterResDto })
  resume(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.resume(userId, id)
  }

  @Post('chapters/:id/pages')
  @ApiOperation({ summary: 'Mangaka upload trang (pencil/ink) → tạo Page (DRAFT)' })
  @ApiErrors(NotSeriesOwnerException, ChapterNotFoundException, ChapterOnHoldException, ChapterNameNotApprovedException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: PageResDto })
  createPage(@Param('id') id: string, @Body() body: CreatePageBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.createPage(userId, id, body)
  }

  @Get('chapters/:id/pages')
  @ApiOperation({ summary: 'List trang của chapter (scoped: chủ sở hữu / editor phụ trách / trợ lý đang cộng tác)' })
  @ApiErrors(ChapterNotFoundException, ChapterAccessDeniedException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.ASSISTANT, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: PageListResDto })
  listPages(@Param('id') id: string, @ActiveUser('userId') userId: string, @ActiveUser('roleName') roleName: string) {
    return this.chapterService.listPages(userId, roleName, id)
  }

  @Patch('pages/:pageId')
  @ApiOperation({
    summary: 'Mangaka cập nhật file gốc/composite/số trang; trạng thái do backend lifecycle quản lý'
  })
  @ApiErrors(
    NotSeriesOwnerException,
    PageNotFoundException,
    PageNotEditableException,
    ChapterOnHoldException,
    DuplicatePageNumberException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: PageResDto })
  updatePage(@Param('pageId') pageId: string, @Body() body: UpdatePageBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.updatePage(userId, pageId, body)
  }

  @Delete('pages/:pageId')
  @ApiOperation({ summary: 'Mangaka xoá trang — cascade xoá Region + Task của trang (chặn khi trang đã COMPLETED)' })
  @ApiErrors(
    NotSeriesOwnerException,
    PageNotFoundException,
    PageNotEditableException,
    PageHasApprovedTasksException,
    ChapterOnHoldException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: DeletePageResDto })
  deletePage(@Param('pageId') pageId: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.deletePage(userId, pageId)
  }

  @Delete('chapters/:id/pages')
  @ApiOperation({ summary: 'Mangaka xoá nhiều trang trong 1 chapter (all-or-nothing, tối đa 50)' })
  @ApiErrors(
    NotSeriesOwnerException,
    ChapterNotFoundException,
    PageNotFoundException,
    PageNotEditableException,
    PageHasApprovedTasksException,
    ChapterOnHoldException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: DeletePagesBulkResDto })
  deletePagesBulk(@Param('id') id: string, @Body() body: DeletePagesBulkBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.deletePagesBulk(userId, id, body)
  }

  @Post('chapters/:id/manuscript/submit')
  @ApiOperation({ summary: 'Mangaka nộp manuscript cho Editor final check → EDITOR_REVIEW' })
  @ApiErrors(
    NotSeriesOwnerException,
    ChapterNotFoundException,
    InvalidManuscriptTransitionException,
    ChapterOnHoldException,
    NoPagesToSubmitException,
    TasksNotAllApprovedException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: ChapterResDto })
  submit(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.submit(userId, id)
  }

  @Post('chapters/:id/manuscript/request-revision')
  @ApiOperation({ summary: 'Editor yêu cầu sửa manuscript → EDITOR_REVISION (kèm Annotation)' })
  @ApiErrors(
    NotSeriesEditorException,
    ChapterNotFoundException,
    InvalidManuscriptTransitionException,
    ChapterOnHoldException,
    NoPagesToSubmitException,
    TasksNotAllApprovedException,
    RevisionNotResolvedException
  )
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: ChapterResDto })
  requestRevision(@Param('id') id: string, @Body() body: RevisionReasonBodyDto, @ActiveUser('userId') userId: string) {
    return this.chapterService.requestRevision(userId, id, body.reason)
  }

  @Post('chapters/:id/manuscript/resubmit')
  @ApiOperation({ summary: 'Mangaka nộp lại sau revision → EDITOR_REVIEW' })
  @ApiErrors(
    NotSeriesOwnerException,
    ChapterNotFoundException,
    InvalidManuscriptTransitionException,
    ChapterOnHoldException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: ChapterResDto })
  resubmit(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.resubmit(userId, id)
  }

  @Post('chapters/:id/manuscript/approve')
  @ApiOperation({ summary: 'Editor duyệt manuscript → READY_FOR_PRINT' })
  @ApiErrors(
    NotSeriesEditorException,
    ChapterNotFoundException,
    InvalidManuscriptTransitionException,
    ChapterOnHoldException
  )
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: ChapterResDto })
  approve(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.approve(userId, id)
  }

  @Post('chapters/:id/publish')
  @ApiOperation({
    summary:
      'Editor xuất bản chapter (chỉ READY_FOR_PRINT) → PUBLISHED + emit chapter.published. Chặn nếu series chưa có Contract FULLY_EXECUTED (BR-CONTRACT-05). Co-owner gate: defer B3.'
  })
  @ApiErrors(
    NotSeriesEditorException,
    ChapterNotFoundException,
    InvalidManuscriptTransitionException,
    ContractNotExecutedException,
    ChapterOnHoldException
  )
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: ChapterResDto })
  publish(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.publish(userId, id)
  }

  @Post('chapters/:id/co-owner-approve')
  @ApiOperation({
    summary: 'A-CHP-06: Co-owner (PARTIAL_TRANSFER) duyệt chapter đang AWAITING_CO_OWNER_APPROVAL → PUBLISHED'
  })
  @ApiErrors(
    NotCoOwnerException,
    CoOwnerApprovalNotPendingException,
    CoOwnerApprovalNotFoundException,
    ChapterNotFoundException,
    InvalidManuscriptTransitionException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: ChapterResDto })
  coOwnerApprove(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.chapterService.coOwnerApprove(userId, id)
  }

  @Post('chapters/:id/co-owner-reject')
  @ApiOperation({ summary: 'A-CHP-06: Co-owner từ chối → Manuscript về EDITOR_REVISION' })
  @ApiErrors(
    NotCoOwnerException,
    CoOwnerApprovalNotPendingException,
    CoOwnerApprovalNotFoundException,
    ChapterNotFoundException,
    InvalidManuscriptTransitionException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: ChapterResDto })
  coOwnerReject(@Param('id') id: string, @ActiveUser('userId') userId: string, @Body() body: ReasonBodyDto) {
    return this.chapterService.coOwnerReject(userId, id, body.reason ?? '')
  }
}
