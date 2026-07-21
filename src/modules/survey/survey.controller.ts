import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
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
  LatestVoteResultsResDto,
  LatestVoteResultsQueryDto,
  ReaderVoteBodyDto,
  ReaderVoteResDto,
  RankingRecordListResDto,
  SurveyDataResDto,
  SurveyPeriodResDto,
  UpdateSurveyPeriodStatusBodyDto,
  VotingConfigBodyDto,
  VotingConfigResDto,
  VoteContextResDto,
  VoteContextQueryDto,
  VoteOtpRequestBodyDto,
  VotePeriodsQueryDto,
  VotePeriodsResDto,
  VoteResultsQueryDto,
  VoteResultsResDto
} from './dto/survey.dto'
import { SurveyService } from './services/survey.service'
import { MessageResDto } from 'src/core/http/dto/response.dto'
import {
  ReaderAlreadyVotedException,
  RankingAccessDeniedException,
  SeriesNotFoundForRankingException,
  SurveyDataImportNotAllowedException,
  SurveyPeriodNotFinalizedException,
  SurveyPeriodNotFoundException,
  SurveyPeriodNotOpenException,
  SurveyPeriodAlreadyFinalizedException,
  TooManySeriesSelectedException,
  DuplicateSeriesInVoteException,
  SeriesNotVotableException,
  VoteOtpNotFoundException,
  VoteOtpRateLimitException,
  VoteIpLimitExceededException,
  VotingConfigNotFoundException,
  CaptchaRejectedException
} from './errors/survey.errors'
import { PublicRateLimitGuard } from 'src/core/security/guards/public-rate-limit.guard'
import { PublicRateLimitedException } from 'src/core/security/errors/public-rate-limit.error'

@ApiTags('survey')
@ApiBearerAuth()
@Controller()
export class SurveyController {
  constructor(private readonly surveyService: SurveyService) {}

  @Post('vote/otp')
  @IsPublic()
  @ApiOperation({ summary: 'Reader yêu cầu OTP cho Guest Voting. Public.' })
  @ApiErrors(VoteOtpRateLimitException(0), CaptchaRejectedException)
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
    VoteIpLimitExceededException,
    TooManySeriesSelectedException,
    DuplicateSeriesInVoteException,
    SeriesNotVotableException,
    CaptchaRejectedException
  )
  @ZodResponse({ status: 200, type: MessageResDto })
  submitVote(@Body() body: ReaderVoteBodyDto, @Req() req: Request) {
    return this.surveyService.submitVote(body, req.ip ?? '')
  }

  // Fix-1 G-2: Public — kỳ OPEN + list series SERIALIZED cho trang vote Guest (B-VOT-08).
  @Get('vote/context')
  @IsPublic()
  @ApiOperation({
    summary:
      'Public — kỳ bình chọn OPEN hiện tại + danh sách series SERIALIZED cho trang vote Guest. Option B: ?publicationType=WEEKLY|MONTHLY|IRREGULAR để tách tab; item kèm publicationType'
  })
  @ZodResponse({ status: 200, type: VoteContextResDto })
  getVoteContext(@Query() query: VoteContextQueryDto) {
    return this.surveyService.getVoteContext(query.publicationType)
  }

  // Spec 15 §3.1 — discover the latest public ranking without a known period id.
  @Get('vote/results/latest')
  @IsPublic()
  @UseGuards(PublicRateLimitGuard)
  @ApiOperation({
    summary: 'Public — bảng xếp hạng kỳ REFLECTED mới nhất (period null nếu chưa có kỳ nào chốt)',
    security: []
  })
  @ApiErrors(PublicRateLimitedException(0))
  @ZodResponse({ status: 200, type: LatestVoteResultsResDto })
  getLatestVoteResults(@Query() query: LatestVoteResultsQueryDto) {
    return this.surveyService.getLatestVoteResults(query.publicationType)
  }

  // Spec 15 §3.2 — reflected-only history for ranking discovery.
  @Get('vote/periods')
  @IsPublic()
  @UseGuards(PublicRateLimitGuard)
  @ApiOperation({ summary: 'Public — danh sách kỳ REFLECTED (dropdown lịch sử ranking)', security: [] })
  @ApiErrors(PublicRateLimitedException(0))
  @ZodResponse({ status: 200, type: VotePeriodsResDto })
  getVotePeriods(@Query() query: VotePeriodsQueryDto) {
    return this.surveyService.getReflectedPeriods(query.limit)
  }

  // Fix-1 G-2: Public — kết quả kỳ đã chốt (REFLECTED); ẩn tín hiệu biên tập nội bộ.
  @Get('vote/results')
  @IsPublic()
  @ApiOperation({
    summary: 'Public — bảng xếp hạng của kỳ đã chốt (REFLECTED); ẩn tín hiệu biên tập nội bộ'
  })
  @ApiErrors(SurveyPeriodNotFoundException, SurveyPeriodNotFinalizedException)
  @ZodResponse({ status: 200, type: VoteResultsResDto })
  getVoteResults(@Query() query: VoteResultsQueryDto) {
    return this.surveyService.getVoteResults(query.surveyPeriodId, query.publicationType)
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
