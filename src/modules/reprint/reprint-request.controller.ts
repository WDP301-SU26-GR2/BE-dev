import { Controller, Get, Post, Body, Param, Patch, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ReprintRequestService } from './services/reprint-request.service'
import {
  CreateReprintRequestBodyDto,
  MangakaReviewReprintBodyDto,
  BoardApproveReprintBodyDto,
  SubmitChapterManuscriptBodyDto,
  EditorApproveChapterBodyDto,
  ReprintRequestResDto,
  ReprintChapterResDto
} from './dto/reprint-request.dto'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'

@ApiTags('reprint-requests')
@ApiBearerAuth()
@Controller('reprint-requests')
export class ReprintRequestController {
  constructor(private readonly reprintRequestService: ReprintRequestService) {}

  @ApiOperation({ summary: 'Danh sách yêu cầu tái bản (filter status/seriesId)' })
  @Get()
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.MANGAKA, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: [ReprintRequestResDto] })
  findAll(
    @ActiveUser('userId') userId: string,
    @Query('status') status?: string,
    @Query('seriesId') seriesId?: string
  ) {
    return this.reprintRequestService.findAll(userId, { status, seriesId })
  }

  @ApiOperation({ summary: 'Chi tiết yêu cầu tái bản' })
  @Get(':id')
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.MANGAKA, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  findById(@Param('id') id: string) {
    return this.reprintRequestService.findById(id)
  }

  @ApiOperation({ summary: 'Danh sách chapter trong yêu cầu tái bản' })
  @Get(':id/chapters')
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.MANGAKA, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: [ReprintChapterResDto] })
  getChapters(@Param('id') id: string) {
    return this.reprintRequestService.getChapters(id)
  }

  @ApiOperation({ summary: 'Chi tiết chapter trong yêu cầu tái bản' })
  @Get(':id/chapters/:chapterId')
  @Roles(RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.MANGAKA, RoleName.SUPER_ADMIN)
  @ZodResponse({ status: 200, type: ReprintChapterResDto })
  getChapterById(@Param('id') id: string, @Param('chapterId') chapterId: string) {
    return this.reprintRequestService.getChapterById(id, chapterId)
  }

  @ApiOperation({ summary: 'Mangaka cập nhật manuscript cho chapter tái bản' })
  @Patch(':id/chapters/:chapterId/manuscript')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  updateChapterManuscript(
    @Param('id') id: string,
    @Param('chapterId') chapterId: string,
    @Body() dto: SubmitChapterManuscriptBodyDto
  ) {
    return this.reprintRequestService.updateChapterManuscript(id, chapterId, dto)
  }

  @ApiOperation({ summary: 'Editor duyệt chapter tái bản' })
  @Patch(':id/chapters/:chapterId/approve')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  approveChapter(
    @Param('id') id: string,
    @Param('chapterId') chapterId: string,
    @Body() dto: EditorApproveChapterBodyDto
  ) {
    return this.reprintRequestService.approveChapter(id, chapterId, dto)
  }

  @ApiOperation({ summary: 'Editor tạo yêu cầu tái bản (B-RPT-01)' })
  @Post()
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: ReprintRequestResDto })
  create(@ActiveUser('userId') userId: string, @Body() dto: CreateReprintRequestBodyDto) {
    return this.reprintRequestService.create(userId, dto)
  }

  @ApiOperation({ summary: 'Mangaka chấp nhận/từ chối yêu cầu tái bản (B-RPT-02)' })
  @Patch(':id/mangaka-review')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  mangakaReview(@Param('id') id: string, @Body() dto: MangakaReviewReprintBodyDto) {
    return this.reprintRequestService.mangakaReview(id, dto)
  }

  @ApiOperation({ summary: 'Board duyệt/từ chối yêu cầu tái bản (B-RPT-02)' })
  @Patch(':id/board-approve')
  @Roles(RoleName.BOARD_MEMBER)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  boardApprove(@Param('id') id: string, @Body() dto: BoardApproveReprintBodyDto) {
    return this.reprintRequestService.boardApprove(id, dto)
  }

  @ApiOperation({ summary: 'Mangaka nộp manuscript sửa đổi cho chapter (B-RPT-03)' })
  @Patch(':id/chapters/manuscript')
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  submitManuscript(@Param('id') id: string, @Body() dto: SubmitChapterManuscriptBodyDto) {
    return this.reprintRequestService.submitChapterManuscript(id, dto)
  }

  @ApiOperation({ summary: 'Editor duyệt/yêu cầu sửa chapter tái bản (B-RPT-03/B-RPT-04)' })
  @Patch(':id/chapters/approve')
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 200, type: ReprintRequestResDto })
  editorApproveChapter(@Param('id') id: string, @Body() dto: EditorApproveChapterBodyDto) {
    return this.reprintRequestService.editorApproveChapter(id, dto)
  }
}
