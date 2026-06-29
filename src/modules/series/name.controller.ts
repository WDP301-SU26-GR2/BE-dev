import { Body, Controller, Param, Post, Put } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import { AddNamePageBodyDto, NameResDto, ReasonBodyDto, UpdateNamePagesBodyDto } from './dto/series.dto'
import {
  InvalidNameStateException,
  NotAssignedEditorException,
  NotSeriesOwnerException,
  SeriesNotFoundException
} from './errors/series.errors'
import { SeriesService } from './series.service'

@ApiTags('series-names')
@ApiBearerAuth()
@Controller('series/:id/names/:nameId')
export class NameController {
  constructor(private readonly seriesService: SeriesService) {}

  @Post('request-revision')
  @ApiOperation({ summary: 'Editor phụ trách yêu cầu sửa Name (→ REVISION)' })
  @ApiErrors(NotAssignedEditorException, SeriesNotFoundException, InvalidNameStateException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: NameResDto })
  requestRevision(
    @Param('id') id: string,
    @Param('nameId') nameId: string,
    @Body() body: ReasonBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.seriesService.requestNameRevision(userId, id, nameId, body.reason)
  }

  @Post('resubmit')
  @ApiOperation({ summary: 'Mangaka nộp lại Name sau revision (→ IN_REVIEW, version++)' })
  @ApiErrors(NotSeriesOwnerException, InvalidNameStateException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: NameResDto })
  resubmit(@Param('id') id: string, @Param('nameId') nameId: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.resubmitName(userId, id, nameId)
  }

  @Post('approve')
  @ApiOperation({ summary: 'Editor duyệt Name (→ APPROVED; nếu proposal cũng APPROVED → READY_TO_PITCH)' })
  @ApiErrors(NotAssignedEditorException, SeriesNotFoundException, InvalidNameStateException)
  @Roles(RoleName.EDITOR)
  @ZodResponse({ status: 201, type: NameResDto })
  approve(@Param('id') id: string, @Param('nameId') nameId: string, @ActiveUser('userId') userId: string) {
    return this.seriesService.approveName(userId, id, nameId)
  }

  @Put('pages')
  @ApiOperation({ summary: 'Mangaka thay TOÀN BỘ mảng trang Name (chỉ khi DRAFT/REVISION)' })
  @ApiErrors(NotSeriesOwnerException, SeriesNotFoundException, InvalidNameStateException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 200, type: NameResDto })
  updatePages(
    @Param('id') id: string,
    @Param('nameId') nameId: string,
    @Body() body: UpdateNamePagesBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.seriesService.updateNamePages(userId, id, nameId, body)
  }

  @Post('pages')
  @ApiOperation({ summary: 'Mangaka thêm 1 trang vào Name (append; chỉ khi DRAFT/REVISION)' })
  @ApiErrors(NotSeriesOwnerException, SeriesNotFoundException, InvalidNameStateException)
  @Roles(RoleName.MANGAKA)
  @ZodResponse({ status: 201, type: NameResDto })
  addPage(
    @Param('id') id: string,
    @Param('nameId') nameId: string,
    @Body() body: AddNamePageBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.seriesService.addNamePage(userId, id, nameId, body)
  }
}
