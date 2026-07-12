import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import { NameService } from './name.service'
import {
  AddNamePageBodyDto,
  CreateChapterNameBodyDto,
  NameListResDto,
  NameResDto,
  ReasonBodyDto,
  UpdateNamePagesBodyDto
} from './dto/name.dto'
import {
  ChapterNameAlreadyExistsException,
  ChapterNotDraftForNameException,
  ChapterNotFoundException,
  InvalidNameStateException,
  NameNotDeletableException,
  NameNotFoundException,
  NotAssignedEditorException,
  NotSeriesOwnerException,
  SeriesAccessDeniedException
} from './errors/name.errors'

@ApiTags('names')
@ApiBearerAuth()
@Controller('chapters/:id/names')
export class ChapterNameController {
  constructor(private readonly nameService: NameService) {}

  @Post()
  @ApiOperation({
    summary: 'Mangaka tạo chapter-Name (storyboard) cho chapter DRAFT — chapter-first'
  })
  @ApiErrors(
    ChapterNotFoundException,
    NotSeriesOwnerException,
    ChapterNotDraftForNameException,
    ChapterNameAlreadyExistsException
  )
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: NameResDto })
  create(@Param('id') id: string, @Body() body: CreateChapterNameBodyDto, @ActiveUser('userId') userId: string) {
    return this.nameService.createChapterName(userId, id, body)
  }

  @Get()
  @ApiOperation({ summary: 'List Name của chapter (thực tế 0..1)' })
  @ApiErrors(ChapterNotFoundException, SeriesAccessDeniedException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: NameListResDto })
  list(@Param('id') id: string, @ActiveUser('userId') userId: string, @ActiveUser('roleName') roleName: string) {
    return this.nameService.chapterListNames({ userId, roleName }, id)
  }

  @Get(':nameId')
  @ApiOperation({ summary: 'Chi tiết Name của chapter' })
  @ApiErrors(ChapterNotFoundException, SeriesAccessDeniedException, NameNotFoundException)
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: NameResDto })
  getOne(
    @Param('id') id: string,
    @Param('nameId') nameId: string,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.nameService.chapterGetName({ userId, roleName }, id, nameId)
  }

  @Post(':nameId/request-revision')
  @ApiOperation({ summary: 'Editor phụ trách yêu cầu sửa Name của chapter → REVISION' })
  @ApiErrors(NotAssignedEditorException, ChapterNotFoundException, NameNotFoundException, InvalidNameStateException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: NameResDto })
  requestRevision(
    @Param('id') id: string,
    @Param('nameId') nameId: string,
    @Body() body: ReasonBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.nameService.chapterRequestRevision(userId, id, nameId, body.reason)
  }

  @Post(':nameId/resubmit')
  @ApiOperation({ summary: 'Mangaka nộp lại Name của chapter → IN_REVIEW, version++' })
  @ApiErrors(NotSeriesOwnerException, ChapterNotFoundException, NameNotFoundException, InvalidNameStateException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: NameResDto })
  resubmit(@Param('id') id: string, @Param('nameId') nameId: string, @ActiveUser('userId') userId: string) {
    return this.nameService.chapterResubmit(userId, id, nameId)
  }

  @Post(':nameId/approve')
  @ApiOperation({ summary: 'Editor duyệt Name của chapter → APPROVED (mở gate upload page)' })
  @ApiErrors(NotAssignedEditorException, ChapterNotFoundException, NameNotFoundException, InvalidNameStateException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: NameResDto })
  approve(@Param('id') id: string, @Param('nameId') nameId: string, @ActiveUser('userId') userId: string) {
    return this.nameService.chapterApprove(userId, id, nameId)
  }

  @Put(':nameId/pages')
  @ApiOperation({ summary: 'Mangaka thay TOÀN BỘ trang Name của chapter (chỉ DRAFT/REVISION)' })
  @ApiErrors(NotSeriesOwnerException, ChapterNotFoundException, NameNotFoundException, InvalidNameStateException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: NameResDto })
  updatePages(
    @Param('id') id: string,
    @Param('nameId') nameId: string,
    @Body() body: UpdateNamePagesBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.nameService.chapterUpdatePages(userId, id, nameId, body)
  }

  @Post(':nameId/pages')
  @ApiOperation({ summary: 'Mangaka thêm 1 trang vào Name của chapter (append; chỉ DRAFT/REVISION)' })
  @ApiErrors(NotSeriesOwnerException, ChapterNotFoundException, NameNotFoundException, InvalidNameStateException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: NameResDto })
  addPage(
    @Param('id') id: string,
    @Param('nameId') nameId: string,
    @Body() body: AddNamePageBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.nameService.chapterAddPage(userId, id, nameId, body)
  }

  @Delete(':nameId')
  @ApiOperation({
    summary: 'Mangaka xoá Name của chapter để vẽ lại (chỉ chapter DRAFT + Name chưa APPROVED)'
  })
  @ApiErrors(NotSeriesOwnerException, ChapterNotFoundException, NameNotFoundException, NameNotDeletableException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: MessageResDto })
  remove(@Param('id') id: string, @Param('nameId') nameId: string, @ActiveUser('userId') userId: string) {
    return this.nameService.deleteChapterName(userId, id, nameId)
  }
}
