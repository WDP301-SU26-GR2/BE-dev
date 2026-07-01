import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { IsPublic } from 'src/core/security/decorators/auth.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import {
  CreateSurveyPeriodBodyDto,
  ImportSurveyDataBodyDto,
  ReaderVoteBodyDto,
  RankingRecordListResDto,
  SurveyPeriodResDto,
  UpdateSurveyPeriodStatusBodyDto,
  VotingConfigBodyDto,
  VotingConfigResDto,
  VoteOtpRequestBodyDto
} from './dto/survey.dto'
import { SurveyService } from './services/survey.service'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import {
  ReaderAlreadyVotedException,
  SurveyDataImportNotAllowedException,
  SurveyPeriodNotFoundException,
  SurveyPeriodNotOpenException,
  SurveyPeriodAlreadyFinalizedException,
  VoteOtpNotFoundException,
  VoteOtpRateLimitException,
  VotingConfigNotFoundException
} from './errors/survey.errors'

@ApiTags('survey')
@ApiBearerAuth()
@Controller()
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  @Post('vote/otp')
  @IsPublic()
  @ApiOperation({ summary: 'Yêu cầu OTP để bình chọn Guest Voting' })
  @ApiErrors(VoteOtpRateLimitException)
  @ZodResponse({ status: 200, type: MessageResDto })
  requestOtp(@Body() body: VoteOtpRequestBodyDto, @Req() req: Request) {
    return this.surveyService.requestOtp(body, req.ip ?? '')
  }

  @Post('vote')
  @IsPublic()
  @ApiOperation({ summary: 'Xác thực OTP và gửi bình chọn Guest Voting' })
  @ApiErrors(
    ReaderAlreadyVotedException,
    SurveyPeriodNotFoundException,
    SurveyPeriodNotOpenException,
    VoteOtpNotFoundException
  )
  @ZodResponse({ status: 200, type: MessageResDto })
  submitVote(@Body() body: ReaderVoteBodyDto, @Req() req: Request) {
    return this.surveyService.submitVote(body, req.ip ?? '')
  }

  @Post('survey-periods')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Tạo kỳ bình chọn mới' })
  @ZodResponse({ status: 201, type: SurveyPeriodResDto })
  createSurveyPeriod(@Body() body: CreateSurveyPeriodBodyDto) {
    return this.surveyService.createSurveyPeriod(body)
  }

  @Patch('survey-periods/:id/status')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Cập nhật trạng thái kỳ bình chọn' })
  @ApiErrors(SurveyPeriodNotFoundException)
  @ZodResponse({ status: 200, type: SurveyPeriodResDto })
  updateSurveyPeriodStatus(@Param('id') id: string, @Body() body: UpdateSurveyPeriodStatusBodyDto) {
    return this.surveyService.updateSurveyPeriodStatus(id, body)
  }

  @Post('survey-data/import')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Nhập dữ liệu bình chọn offline từ postcard' })
  @ApiErrors(SurveyPeriodNotFoundException, SurveyDataImportNotAllowedException)
  @ZodResponse({ status: 201, type: MessageResDto })
  importSurveyData(@Body() body: ImportSurveyDataBodyDto, @ActiveUser('userId') userId: string) {
    return this.surveyService.importSurveyData(body, userId)
  }

  @Post('survey-periods/:id/finalize')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Hoàn tất tính toán xếp hạng cho kỳ bình chọn' })
  @ApiErrors(SurveyPeriodNotFoundException, SurveyPeriodAlreadyFinalizedException, SurveyDataImportNotAllowedException)
  @ZodResponse({ status: 200, type: MessageResDto })
  finalizeRanking(@Param('id') id: string) {
    return this.surveyService.finalizeRanking(id)
  }

  @Get('survey-periods/:id/rankings')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER)
  @ApiOperation({ summary: 'Lấy kết quả xếp hạng của kỳ bình chọn' })
  @ZodResponse({ status: 200, type: RankingRecordListResDto })
  getRankingRecords(@Param('id') id: string) {
    return this.surveyService.getRankingRecords(id)
  }

  @Get('voting-config')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Lấy cấu hình bình chọn hiện tại' })
  @ZodResponse({ status: 200, type: VotingConfigResDto })
  getVotingConfig() {
    return this.surveyService.getVotingConfig()
  }

  @Patch('voting-config')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Cập nhật cấu hình bình chọn' })
  @ApiErrors(VotingConfigNotFoundException)
  @ZodResponse({ status: 200, type: VotingConfigResDto })
  updateVotingConfig(@Body() body: VotingConfigBodyDto) {
    return this.surveyService.updateVotingConfig(body)
  }
}
