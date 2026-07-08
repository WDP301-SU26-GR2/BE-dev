import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common'
import type { Request } from 'express'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { IsPublic } from 'src/core/security/decorators/auth.decorator'
import { ActiveUser } from 'src/core/security/decorators/active-user.decorator'
import { RoleName } from 'src/core/security/constants/role.constant'
import { Roles } from 'src/core/security/decorators/roles.decorator'
import {
  BoardRankingListResDto,
  CreateSurveyPeriodBodyDto,
  GetSeriesTrendQueryDto,
  ImportSurveyDataBodyDto,
  ReaderVoteBodyDto,
  ReaderVoteResDto,
  RankingRecordListResDto,
  SurveyDataResDto,
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
  RankingAccessDeniedException,
  SeriesNotFoundForRankingException,
  SurveyDataImportNotAllowedException,
  SurveyPeriodNotFoundException,
  SurveyPeriodNotOpenException,
  SurveyPeriodAlreadyFinalizedException,
  TooManySeriesSelectedException,
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
  @ApiOperation({ summary: 'Reader yêu cầu OTP cho Guest Voting. Public.' })
  @ApiErrors(VoteOtpRateLimitException)
  @ZodResponse({ status: 200, type: MessageResDto })
  requestOtp(@Body() body: VoteOtpRequestBodyDto, @Req() req: Request) {
    return this.surveyService.requestOtp(body, req.ip ?? '')
  }

  @Post('vote')
  @IsPublic()
  @ApiOperation({ summary: 'Reader xác thực OTP và gửi vote. Public.' })
  @ApiErrors(
    ReaderAlreadyVotedException,
    SurveyPeriodNotFoundException,
    SurveyPeriodNotOpenException,
    VoteOtpNotFoundException,
    TooManySeriesSelectedException
  )
  @ZodResponse({ status: 200, type: MessageResDto })
  submitVote(@Body() body: ReaderVoteBodyDto, @Req() req: Request) {
    return this.surveyService.submitVote(body, req.ip ?? '')
  }

  @Get('survey-periods')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER)
  @ApiOperation({ summary: 'Danh sách kỳ bình chọn' })
  @ZodResponse({ status: 200, type: [SurveyPeriodResDto] })
  getSurveyPeriods() {
    return this.surveyService.getSurveyPeriods()
  }

  @Get('survey-periods/:id')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER)
  @ApiOperation({ summary: 'Chi tiết kỳ bình chọn' })
  @ZodResponse({ status: 200, type: SurveyPeriodResDto })
  getSurveyPeriodById(@Param('id') id: string) {
    return this.surveyService.getSurveyPeriodById(id)
  }

  @Get('survey-periods/:id/votes')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER)
  @ApiOperation({ summary: 'Danh sách phiếu vote của kỳ bình chọn' })
  @ZodResponse({ status: 200, type: [ReaderVoteResDto] })
  getSurveyPeriodVotes(@Param('id') id: string) {
    return this.surveyService.getSurveyPeriodVotes(id)
  }

  @Get('survey-periods/:id/survey-data')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER)
  @ApiOperation({ summary: 'Danh sách dữ liệu vote offline của kỳ bình chọn' })
  @ZodResponse({ status: 200, type: [SurveyDataResDto] })
  getSurveyPeriodSurveyData(@Param('id') id: string) {
    return this.surveyService.getSurveyPeriodSurveyData(id)
  }

  @Post('survey-periods')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Editor tạo kỳ bình chọn mới → DRAFT/OPEN/CLOSED' })
  @ZodResponse({ status: 201, type: SurveyPeriodResDto })
  createSurveyPeriod(@Body() body: CreateSurveyPeriodBodyDto, @ActiveUser('userId') userId: string) {
    return this.surveyService.createSurveyPeriod(body, userId)
  }

  @Patch('survey-periods/:id/status')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Editor cập nhật trạng thái kỳ bình chọn → OPEN/CLOSED/REFLECTED' })
  @ApiErrors(SurveyPeriodNotFoundException)
  @ZodResponse({ status: 200, type: SurveyPeriodResDto })
  updateSurveyPeriodStatus(
    @Param('id') id: string,
    @Body() body: UpdateSurveyPeriodStatusBodyDto,
    @ActiveUser('userId') userId: string
  ) {
    return this.surveyService.updateSurveyPeriodStatus(id, body, userId)
  }

  @Post('survey-data/import')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Editor nhập vote offline từ postcard' })
  @ApiErrors(SurveyPeriodNotFoundException, SurveyDataImportNotAllowedException)
  @ZodResponse({ status: 201, type: MessageResDto })
  importSurveyData(@Body() body: ImportSurveyDataBodyDto, @ActiveUser('userId') userId: string) {
    return this.surveyService.importSurveyData(body, userId)
  }

  @Post('survey-periods/:id/finalize')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Editor finalize ranking cho kỳ bình chọn' })
  @ApiErrors(SurveyPeriodNotFoundException, SurveyPeriodAlreadyFinalizedException, SurveyDataImportNotAllowedException)
  @ZodResponse({ status: 200, type: MessageResDto })
  finalizeRanking(@Param('id') id: string, @ActiveUser('userId') userId: string) {
    return this.surveyService.finalizeRanking(id, userId)
  }

  @Get('survey-periods/:id/rankings')
  @Roles(RoleName.EDITOR, RoleName.SUPER_ADMIN, RoleName.BOARD_MEMBER)
  @ApiOperation({ summary: 'Danh sách ranking của kỳ bình chọn' })
  @ZodResponse({ status: 200, type: RankingRecordListResDto })
  getRankingRecords(@Param('id') id: string) {
    return this.surveyService.getRankingRecords(id)
  }

  // PB-04: bảng xếp hạng toàn tạp chí 1 kỳ — full cho mọi role nội bộ (không scope owner).
  @Get('rankings/board')
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'PB-04: bảng xếp hạng toàn tạp chí 1 kỳ (full, mọi role nội bộ)' })
  @ApiErrors(SurveyPeriodNotFoundException)
  @ZodResponse({ status: 200, type: BoardRankingListResDto })
  getBoardRanking(@Query('surveyPeriodId') surveyPeriodId: string) {
    return this.surveyService.getBoardRanking(surveyPeriodId)
  }

  // PB-04: trend 1 series — scoping theo owner.
  @Get('rankings')
  @Roles(RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'PB-04: trend xếp hạng 1 series (scoped theo owner)' })
  @ApiErrors(RankingAccessDeniedException, SeriesNotFoundForRankingException)
  @ZodResponse({ status: 200, type: BoardRankingListResDto })
  getSeriesTrend(
    @Query() q: GetSeriesTrendQueryDto,
    @ActiveUser('userId') userId: string,
    @ActiveUser('roleName') roleName: string
  ) {
    return this.surveyService.getSeriesTrend(q.seriesId, q.periods, { userId, roleName })
  }

  @Get('voting-config')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Xem cấu hình bình chọn hiện tại' })
  @ZodResponse({ status: 200, type: VotingConfigResDto })
  getVotingConfig() {
    return this.surveyService.getVotingConfig()
  }

  @Patch('voting-config')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin cập nhật cấu hình bình chọn' })
  @ApiErrors(VotingConfigNotFoundException)
  @ZodResponse({ status: 200, type: VotingConfigResDto })
  updateVotingConfig(@Body() body: VotingConfigBodyDto) {
    return this.surveyService.updateVotingConfig(body)
  }
}
