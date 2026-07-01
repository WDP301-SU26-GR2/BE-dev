import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { SurveyMessages } from '../survey.messages'

const E = SurveyMessages.error

export const SurveyPeriodNotFoundException = new NotFoundException(E.surveyPeriodNotFound)
export const SurveyPeriodNotOpenException = new BadRequestException(E.surveyPeriodNotOpen)
export const SurveyPeriodAlreadyFinalizedException = new BadRequestException(E.surveyPeriodAlreadyFinalized)
export const ReaderAlreadyVotedException = new ConflictException(E.readerAlreadyVoted)
export const VoteOtpNotFoundException = new BadRequestException(E.voteOtpNotFound)
export const VoteOtpRateLimitException = new BadRequestException(E.voteOtpRateLimit)
export const SurveyDataImportNotAllowedException = new BadRequestException(E.surveyDataImportNotAllowed)
export const RankingFinalizeNotAllowedException = new BadRequestException(E.rankingFinalizeNotAllowed)
export const VotingConfigNotFoundException = new NotFoundException(E.votingConfigNotFound)
