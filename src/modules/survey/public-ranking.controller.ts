import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { ApiErrors } from 'src/core/http/decorators/api-errors.decorator'
import { IsPublic } from 'src/core/security/decorators/auth.decorator'
import { PublicRateLimitedException } from 'src/core/security/errors/public-rate-limit.error'
import { PublicRateLimitGuard } from 'src/core/security/guards/public-rate-limit.guard'
import {
  LatestVoteResultsQueryDto,
  LatestVoteResultsResDto,
  RankingAggregateQueryDto,
  RankingAggregateResDto,
  VotePeriodsQueryDto,
  VotePeriodsResDto,
  VoteResultsQueryDto,
  VoteResultsResDto
} from './dto/survey.dto'
import { SurveyPeriodNotFinalizedException, SurveyPeriodNotFoundException } from './errors/survey.errors'
import { SurveyService } from './services/survey.service'

@ApiTags('survey')
@Controller()
export class PublicRankingController {
  constructor(private readonly surveyService: SurveyService) {}

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
    return this.surveyService.getLatestVoteResults(query.magazine, query.publicationType)
  }

  @Get('vote/periods')
  @IsPublic()
  @UseGuards(PublicRateLimitGuard)
  @ApiOperation({ summary: 'Public — danh sách kỳ REFLECTED (dropdown lịch sử ranking)', security: [] })
  @ApiErrors(PublicRateLimitedException(0))
  @ZodResponse({ status: 200, type: VotePeriodsResDto })
  getVotePeriods(@Query() query: VotePeriodsQueryDto) {
    return this.surveyService.getReflectedPeriods(query.magazine, query.publicationType, query.limit)
  }

  @Get('vote/results')
  @IsPublic()
  @ApiOperation({
    summary: 'Public — bảng xếp hạng của kỳ đã chốt (REFLECTED); ẩn tín hiệu biên tập nội bộ'
  })
  @ApiErrors(SurveyPeriodNotFoundException, SurveyPeriodNotFinalizedException)
  @ZodResponse({ status: 200, type: VoteResultsResDto })
  getVoteResults(@Query() query: VoteResultsQueryDto) {
    return this.surveyService.getVoteResults(query.surveyPeriodId)
  }

  @Get('rankings/aggregate')
  @IsPublic()
  @ApiOperation({
    summary: 'Public participation-adjusted ranking aggregate for a magazine, publication type, and UTC month or year',
    security: []
  })
  @ZodResponse({ status: 200, type: RankingAggregateResDto })
  getRankingAggregate(@Query() query: RankingAggregateQueryDto) {
    return this.surveyService.getRankingAggregate(query)
  }
}
