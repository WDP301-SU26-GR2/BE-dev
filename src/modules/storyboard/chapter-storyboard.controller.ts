import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import { StoryboardFacade } from './services/storyboard.facade'
import {
  AddStoryboardPageBodyDto,
  CreateChapterStoryboardBodyDto,
  StoryboardListResDto,
  StoryboardResDto,
  StoryboardReasonBodyDto,
  UpdateStoryboardPagesBodyDto
} from './dto/storyboard.dto'
import {
  ChapterStoryboardAlreadyExistsException,
  ChapterNotDraftForStoryboardException,
  ChapterNotFoundException,
  InvalidStoryboardStateException,
  StoryboardNotDeletableException,
  StoryboardNotFoundException,
  NotAssignedEditorException,
  NotSeriesOwnerException,
  SeriesAccessDeniedException
} from './errors/storyboard.errors'

@ApiTags('storyboards')
@ApiBearerAuth()
@Controller('chapters/:id/storyboards')
export class ChapterStoryboardController {
  constructor(private readonly storyboardService: StoryboardFacade) {}

  @Post()
  @ApiOperation({
    summary: 'Mangaka tạo chapter-storyboard (bản phác thảo) cho chapter DRAFT — chapter-first'
  })
  @ApiErrors(
    ChapterNotFoundException,
    NotSeriesOwnerException,
    ChapterNotDraftForStoryboardException,
    ChapterStoryboardAlreadyExistsException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: StoryboardResDto })
  create(@Param('id') id: string, @Body() body: CreateChapterStoryboardBodyDto, @ActiveUser('userId') userId: string) {
    return this.storyboardService.createChapterStoryboard(userId, id, body)
  }

  @Post(':storyboardId/submit')
  @ApiOperation({ summary: 'Mangaka nộp chapter-storyboard lên Editor duyệt → DRAFT chuyển SUBMITTED' })
  @ApiErrors(
    NotSeriesOwnerException,
    ChapterNotFoundException,
    StoryboardNotFoundException,
    InvalidStoryboardStateException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: StoryboardResDto })
  submit(@Param('id') id: string, @Param('storyboardId') storyboardId: string, @ActiveUser('userId') userId: string) {
    return this.storyboardService.chapterSubmit(userId, id, storyboardId)
  }

  @Get()
  @ApiOperation({ summary: 'List storyboard của chapter (thực tế 0..1)' })
  @ApiErrors(ChapterNotFoundException, SeriesAccessDeniedException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: StoryboardListResDto })
  list(@Param('id') id: string, @ActiveUser('userId') userId: string, @ActiveUser('roleName') roleName: string) {
    return this.storyboardService.chapterListStoryboards({ userId, roleName }, id)
  }

  @Get(':storyboardId')
  @ApiOperation({ summary: 'Chi tiết storyboard của chapter' })
  @ApiErrors(ChapterNotFoundException, SeriesAccessDeniedException, StoryboardNotFoundException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: StoryboardResDto })
  getOne(
    @Param('id') id: string,
    @Param('storyboardId') storyboardId: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.storyboardService.chapterGetStoryboard({ userId, roleName }, id, storyboardId)
  }

  @Post(':storyboardId/request-revision')
  @ApiOperation({ summary: 'Editor phụ trách yêu cầu sửa storyboard của chapter → REVISION' })
  @ApiErrors(
    NotAssignedEditorException,
    ChapterNotFoundException,
    StoryboardNotFoundException,
    InvalidStoryboardStateException
  )
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: StoryboardResDto })
  requestRevision(
    @Param('id') id: string,
    @Param('storyboardId') storyboardId: string,
    @Body() body: StoryboardReasonBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.storyboardService.chapterRequestRevision(userId, id, storyboardId, body.reason)
  }

  @Post(':storyboardId/resubmit')
  @ApiOperation({ summary: 'Mangaka nộp lại storyboard của chapter → IN_REVIEW, version++' })
  @ApiErrors(
    NotSeriesOwnerException,
    ChapterNotFoundException,
    StoryboardNotFoundException,
    InvalidStoryboardStateException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: StoryboardResDto })
  resubmit(@Param('id') id: string, @Param('storyboardId') storyboardId: string, @ActiveUser('userId') userId: string) {
    return this.storyboardService.chapterResubmit(userId, id, storyboardId)
  }

  @Post(':storyboardId/approve')
  @ApiOperation({ summary: 'Editor duyệt storyboard của chapter → APPROVED (mở gate upload page)' })
  @ApiErrors(
    NotAssignedEditorException,
    ChapterNotFoundException,
    StoryboardNotFoundException,
    InvalidStoryboardStateException
  )
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: StoryboardResDto })
  approve(@Param('id') id: string, @Param('storyboardId') storyboardId: string, @ActiveUser('userId') userId: string) {
    return this.storyboardService.chapterApprove(userId, id, storyboardId)
  }

  @Put(':storyboardId/pages')
  @ApiOperation({ summary: 'Mangaka thay TOÀN BỘ trang storyboard của chapter (chỉ DRAFT/REVISION)' })
  @ApiErrors(
    NotSeriesOwnerException,
    ChapterNotFoundException,
    StoryboardNotFoundException,
    InvalidStoryboardStateException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: StoryboardResDto })
  updatePages(
    @Param('id') id: string,
    @Param('storyboardId') storyboardId: string,
    @Body() body: UpdateStoryboardPagesBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.storyboardService.chapterUpdatePages(userId, id, storyboardId, body)
  }

  @Post(':storyboardId/pages')
  @ApiOperation({ summary: 'Mangaka thêm 1 trang vào storyboard của chapter (append; chỉ DRAFT/REVISION)' })
  @ApiErrors(
    NotSeriesOwnerException,
    ChapterNotFoundException,
    StoryboardNotFoundException,
    InvalidStoryboardStateException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: StoryboardResDto })
  addPage(
    @Param('id') id: string,
    @Param('storyboardId') storyboardId: string,
    @Body() body: AddStoryboardPageBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.storyboardService.chapterAddPage(userId, id, storyboardId, body)
  }

  @Delete(':storyboardId')
  @ApiOperation({
    summary: 'Mangaka xoá storyboard của chapter để vẽ lại (chỉ chapter DRAFT + storyboard chưa APPROVED)'
  })
  @ApiErrors(
    NotSeriesOwnerException,
    ChapterNotFoundException,
    StoryboardNotFoundException,
    StoryboardNotDeletableException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: MessageResDto })
  remove(@Param('id') id: string, @Param('storyboardId') storyboardId: string, @ActiveUser('userId') userId: string) {
    return this.storyboardService.deleteChapterStoryboard(userId, id, storyboardId)
  }
}
