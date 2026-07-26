import { Injectable } from '@nestjs/common'
import { ReaderVoteBodyDto, VoteOtpRequestBodyDto } from '../dto/survey.dto'
import { ReaderVoteService } from './reader-vote.service'
import { SurveyOtpRequestService } from './survey-otp-request.service'
import { VoteTallyService } from './vote-tally.service'

@Injectable()
export class GuestVoteService {
  constructor(
    private readonly otpRequestService: SurveyOtpRequestService,
    private readonly readerVoteService: ReaderVoteService,
    private readonly voteTallyService: VoteTallyService
  ) {}

  requestOtp(body: VoteOtpRequestBodyDto, ip: string) {
    return this.otpRequestService.requestOtp(body, ip)
  }
  submitVote(body: ReaderVoteBodyDto, ip: string) {
    return this.readerVoteService.submitVote(body, ip)
  }
  getLiveTally(periodId: string) {
    return this.voteTallyService.getLiveTally(periodId)
  }
}
