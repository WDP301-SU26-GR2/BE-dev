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
  ReaderVoteBodyDto,
  ReaderVoteListItemDto,
  RankingRecordListResDto,
  SurveyDataResDto,
  SurveyPeriodResDto,
  UpdateSurveyPeriodStatusBodyDto,
  VotingConfigBodyDto,
  VotingConfigResDto,
  VoteContextResDto,
  OpenVotePeriodsQueryDto,
  OpenVotePeriodsResDto,
  VoteContextQueryDto,
  VoteOtpRequestBodyDto,
  VoteLiveQueryDto,
  VoteTallyResDto
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
  DuplicateSeriesInVoteException,
  SeriesNotVotableException,
  VoteOtpDeliveryFailedException,
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
  @ApiErrors(VoteOtpRateLimitException(0), CaptchaRejectedException, VoteOtpDeliveryFailedException)
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
  // Guest discovery: `/vote/context` + `/vote/live` + `POST /vote` đều cần periodId, còn
  // `/vote/periods` chỉ trả kỳ REFLECTED ⇒ trước đây guest không có đường public nào biết kỳ nào
  // đang mở. Trả LIST vì Option B cho phép nhiều kỳ scoped OPEN song song (WEEKLY + MONTHLY).
  @Get('vote/periods/open')
  @IsPublic()
  @UseGuards(PublicRateLimitGuard)
  @ApiOperation({
    summary:
      'Public — danh sách kỳ bình chọn đang OPEN (điểm vào của Guest: lấy periodId cho /vote/context, /vote/live, POST /vote). Lọc tuỳ chọn ?magazine=&publicationType=; mảng rỗng = chưa có kỳ nào mở',
    security: []
  })
  @ApiErrors(PublicRateLimitedException(0))
  @ZodResponse({ status: 200, type: OpenVotePeriodsResDto })
  getOpenVotePeriods(@Query() query: OpenVotePeriodsQueryDto) {
    return this.surveyService.getOpenPeriods(query.magazine, query.publicationType)
  }

  @Get('vote/live')
  @IsPublic()
  @ApiOperation({
    summary: 'Public live raw vote tally for one OPEN scoped issue; not a final weighted ranking',
    security: []
  })
  @ApiErrors(SurveyPeriodNotFoundException, SurveyPeriodNotOpenException)
  @ZodResponse({ status: 200, type: VoteTallyResDto })
  getVoteLive(@Query() query: VoteLiveQueryDto) {
    return this.surveyService.getLiveTally(query.periodId)
  }

  @Get('vote/context')
  @IsPublic()
  @ApiOperation({
    summary:
      'Public — kỳ bình chọn OPEN hiện tại + danh sách series SERIALIZED cho trang vote Guest. Option B: ?publicationType=WEEKLY|MONTHLY|IRREGULAR để tách tab; item kèm publicationType'
  })
  @ZodResponse({ status: 200, type: VoteContextResDto })
  getVoteContext(@Query() query: VoteContextQueryDto) {
    return this.surveyService.getVoteContext(query.periodId)
  }

  // Spec 15 §3.1/§3.2 + Fix-1 G-2: các route ranking public (`/vote/results/latest`,
  // `/vote/periods`, `/vote/results`, `/rankings/aggregate`) sống ở `PublicRankingController`.
  // Bản nhân bản trong controller này thiếu `@Get` nên chưa bao giờ được Nest map — đã xoá
  // 2026-07-27 (guard `has no dead handler` trong spec chặn tái diễn).

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
  @ZodResponse({ status: 200, type: [ReaderVoteListItemDto] })
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
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Super Admin tạo kỳ bình chọn mới → DRAFT/OPEN/CLOSED. Kỳ bình chọn là đơn vị theo KỲ PHÁT HÀNH (toàn tạp chí) nên thuộc thẩm quyền vận hành toà soạn; Editor/Tantou chỉ phụ trách series nên KHÔNG mở được kỳ (vẫn đọc được mọi route GET).'
  })
  @ZodResponse({ status: 201, type: SurveyPeriodResDto })
  createSurveyPeriod(@Body() body: CreateSurveyPeriodBodyDto, @ActiveUser('userId') userId: string) {
    return this.surveyService.createSurveyPeriod(body, userId)
  }

  @Patch('survey-periods/:id/status')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Super Admin cập nhật trạng thái kỳ bình chọn → OPEN/CLOSED/REFLECTED. Đóng/mở kỳ ảnh hưởng toàn bộ series trong kỳ nên là quyết định cấp tạp chí, không phải cấp series.'
  })
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
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Super Admin nhập vote offline từ postcard cho cả kỳ. Dữ liệu phiếu giấy gộp nhiều series nên không thuộc phạm vi một Editor.'
  })
  @ApiErrors(SurveyPeriodNotFoundException, SurveyDataImportNotAllowedException)
  @ZodResponse({ status: 201, type: MessageResDto })
  importSurveyData(@Body() body: ImportSurveyDataBodyDto, @ActiveUser('userId') userId: string) {
    return this.surveyService.importSurveyData(body, userId)
  }

  @Post('survey-periods/:id/finalize')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Super Admin finalize ranking cho kỳ bình chọn. Chốt xếp hạng so sánh TOÀN BỘ series trong kỳ — Editor phụ trách một vài series không thể là người chốt (xung đột lợi ích).'
  })
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
