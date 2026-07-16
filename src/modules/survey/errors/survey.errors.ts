import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common'
import { SurveyMessages } from '../survey.messages'

const E = SurveyMessages.error

export const SurveyPeriodNotFoundException = new NotFoundException(E.surveyPeriodNotFound)
export const SurveyPeriodNotOpenException = new BadRequestException(E.surveyPeriodNotOpen)
export const SurveyPeriodAlreadyFinalizedException = new BadRequestException(E.surveyPeriodAlreadyFinalized)
export const SurveyPeriodNotFinalizedException = new ConflictException(E.surveyPeriodNotFinalized)
export const ReaderAlreadyVotedException = new ConflictException(E.readerAlreadyVoted)
export const VoteOtpNotFoundException = new BadRequestException(E.voteOtpNotFound)
export const VoteOtpRateLimitException = (retryAfter: number) =>
  new HttpException(
    { message: E.voteOtpRateLimit, code: 'VOTE_OTP_RATE_LIMITED', retryAfter },
    HttpStatus.TOO_MANY_REQUESTS
  )
export const VoteIpLimitExceededException = new HttpException(E.voteIpLimitExceeded, HttpStatus.TOO_MANY_REQUESTS)
export const SurveyDataImportNotAllowedException = new BadRequestException(E.surveyDataImportNotAllowed)
export const RankingFinalizeNotAllowedException = new BadRequestException(E.rankingFinalizeNotAllowed)
export const VotingConfigNotFoundException = new NotFoundException(E.votingConfigNotFound)
export const TooManySeriesSelectedException = new UnprocessableEntityException([
  { message: E.tooManySeriesSelected, path: 'seriesIds' }
])
// PB-03 (6): seriesIds không trùng + mọi series phải đang SERIALIZED trong kỳ (validate app-layer — không FK cứng).
export const DuplicateSeriesInVoteException = new UnprocessableEntityException([
  { message: E.duplicateSeriesInVote, path: 'seriesIds' }
])
export const SeriesNotVotableException = new UnprocessableEntityException([
  { message: E.seriesNotVotable, path: 'seriesIds' }
])
export const CaptchaRejectedException = new ForbiddenException(E.captchaRejected)
export const RankingAccessDeniedException = new ForbiddenException(E.rankingAccessDenied)
export const SeriesNotFoundForRankingException = new NotFoundException(E.seriesNotFoundForRanking)
