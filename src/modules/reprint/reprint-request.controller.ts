import { Controller, Post, Body, Param, Patch } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ReprintRequestService } from './services/reprint-request.service'
import {
  CreateReprintRequestBodyDto,
  MangakaReviewReprintBodyDto,
  BoardApproveReprintBodyDto,
  SubmitChapterManuscriptBodyDto,
  EditorApproveChapterBodyDto
} from './dto/reprint-request.dto'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'

@ApiTags('reprint-requests')
@ApiBearerAuth()
@Controller('reprint-requests')
export class ReprintRequestController {
  constructor(private readonly reprintRequestService: ReprintRequestService) {}

  @ApiOperation({ summary: 'Tạo yêu cầu tái bản (B-RPT-01)' })
  @Post()
  @Roles(RoleName.EDITOR)
  create(@ActiveUser('userId') userId: string, @Body() dto: CreateReprintRequestBodyDto) {
    return this.reprintRequestService.create(userId, dto)
  }

  @ApiOperation({ summary: 'Mangaka phản hồi yêu cầu tái bản (B-RPT-02)' })
  @Patch(':id/mangaka-review')
  @Roles(RoleName.MANGAKA)
  mangakaReview(@Param('id') id: string, @Body() dto: MangakaReviewReprintBodyDto) {
    return this.reprintRequestService.mangakaReview(id, dto)
  }

  @ApiOperation({ summary: 'Hội đồng phê duyệt yêu cầu tái bản (B-RPT-02)' })
  @Patch(':id/board-approve')
  @Roles(RoleName.BOARD_MEMBER)
  boardApprove(@Param('id') id: string, @Body() dto: BoardApproveReprintBodyDto) {
    return this.reprintRequestService.boardApprove(id, dto)
  }

  @ApiOperation({ summary: 'Mangaka nộp bản thảo sửa đổi cho chương (B-RPT-03)' })
  @Patch(':id/chapters/manuscript')
  @Roles(RoleName.MANGAKA)
  submitManuscript(@Param('id') id: string, @Body() dto: SubmitChapterManuscriptBodyDto) {
    return this.reprintRequestService.submitChapterManuscript(id, dto)
  }

  @ApiOperation({ summary: 'Editor phê duyệt chương tái bản (B-RPT-03 & B-RPT-04)' })
  @Patch(':id/chapters/approve')
  @Roles(RoleName.EDITOR)
  editorApproveChapter(@Param('id') id: string, @Body() dto: EditorApproveChapterBodyDto) {
    return this.reprintRequestService.editorApproveChapter(id, dto)
  }
}
