import { Injectable } from '@nestjs/common'
import { PublicationType } from '@prisma/client'
import { RecaptchaService } from 'src/infrastructure/captcha/recaptcha.service'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RedisService } from 'src/infrastructure/redis/redis.service'
import { ReaderVoteBodyDto } from '../dto/survey.dto'
import {
  CaptchaRejectedException,
  DuplicateSeriesInVoteException,
  ReaderAlreadyVotedException,
  SeriesNotVotableException,
  SurveyPeriodNotFoundException,
  SurveyPeriodNotOpenException,
  TooManySeriesSelectedException,
  VoteIpLimitExceededException
} from '../errors/survey.errors'
import { SURVEY_CONFIG, VOTE_IP_QUOTA_TTL_SEC } from '../survey.constant'
import { SurveyMessages } from '../survey.messages'
import { SurveyRepository } from '../survey.repo'
import { VoteGateway } from '../vote.gateway'
import { SurveyConfigService } from './survey-config.service'
import { SurveyOtpService } from './survey-otp.service'

@Injectable()
export class ReaderVoteService {
  constructor(
    private readonly surveyRepository: SurveyRepository,
    private readonly surveyConfigService: SurveyConfigService,
    private readonly surveyOtpService: SurveyOtpService,
    private readonly recaptchaService: RecaptchaService,
    private readonly redisService: RedisService,
    private readonly voteGateway: VoteGateway
  ) {}

  async submitVote(body: ReaderVoteBodyDto, ip: string) {
    // B-VOT-06: captcha threshold + maxSeriesPerVote từ VotingConfig DB.
    const config = await this.surveyConfigService.get()

    // Enforce maxSeriesPerVote từ config (admin có thể giảm xuống dưới 3 nhưng không vượt 3 —
    if (body.seriesIds.length > config.maxSeriesPerVote) {
      throw TooManySeriesSelectedException
    }

    // Spec 11 §1.1: guard body.surveyPeriodId TRƯỚC khi đụng Prisma/OTP — id rác sẽ throw P2023 (500)
    if (!isObjectId(body.surveyPeriodId)) throw SurveyPeriodNotFoundException

    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(body.surveyPeriodId)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    if (surveyPeriod.status !== 'OPEN') throw SurveyPeriodNotOpenException

    // New scoped periods are an immutable issue snapshot. Keep the legacy path
    // intact for historical unscoped data, but never let a scoped ballot widen
    // beyond its stored eligibility list.
    const isScopedPeriod =
      surveyPeriod.magazine != null &&
      surveyPeriod.publicationType != null &&
      surveyPeriod.issueNumber != null &&
      surveyPeriod.eligibleSeriesIds.length > 0
    if (isScopedPeriod) {
      const eligible = new Set(surveyPeriod.eligibleSeriesIds)
      if (body.seriesIds.some((id) => !eligible.has(id))) throw SeriesNotVotableException
    }

    // PB-03 (6): seriesIds không trùng + mọi series phải đang SERIALIZED (validate app-layer —
    // Validate TRƯỚC bước OTP để phiếu không hợp lệ không đốt OTP của độc giả,
    if (new Set(body.seriesIds).size !== body.seriesIds.length) throw DuplicateSeriesInVoteException
    if (body.seriesIds.some((id) => !isObjectId(id))) throw SeriesNotVotableException
    const votableSeries = await this.surveyRepository.findSeriesOwnershipByIds(body.seriesIds)
    const votableStatusById = new Map<string, string>(
      votableSeries.map((s): [string, string] => [String(s.id), String(s.status)])
    )
    if (body.seriesIds.some((id) => votableStatusById.get(id) !== 'SERIALIZED')) throw SeriesNotVotableException

    // Option B: type của phiếu = type CHUNG của các series được chọn (nguồn sự thật = series, KHÔNG
    const voteTypes = new Set(votableSeries.map((s) => s.publicationType ?? null))
    if (!isScopedPeriod && voteTypes.size > 1) throw SeriesNotVotableException
    const voteType: PublicationType | null = isScopedPeriod
      ? surveyPeriod.publicationType
      : (votableSeries[0]?.publicationType ?? null)

    // Deterministic HMAC (NOT bcrypt) so the (surveyPeriodId, identityHash) dedup + unique
    // constraint actually catch repeat votes — see B-VOT-03 fix / IdentityHashService.
    const identityHash = this.surveyOtpService.hashIdentity(body.identity)
    const ipHash = this.surveyOtpService.hashIp(ip)

    // Lớp 1 (nguồn sự thật steady-state): đếm phiếu ĐÃ GHI trong DB — đúng cả khi Redis flush/restart.
    const ipVotes = await this.surveyRepository.countReaderVotesByPeriodAndIp(body.surveyPeriodId, ipHash, voteType)
    if (ipVotes >= config.ipVotesPerPeriod) throw VoteIpLimitExceededException

    // ghi được (409/403/OTP sai) để quota giữ ngữ nghĩa cũ: chỉ đếm phiếu ghi thật.
    const ipQuotaKey = `survey:vote:ipq:${body.surveyPeriodId}:${voteType ?? 'NONE'}:${ipHash}`
    const reservedCount = await this.redisService.incrWithTtl(ipQuotaKey, VOTE_IP_QUOTA_TTL_SEC)
    if (reservedCount != null && reservedCount > config.ipVotesPerPeriod) {
      await this.redisService.decrSafe(ipQuotaKey)
      throw VoteIpLimitExceededException
    }

    try {
      const existingVote = await this.surveyRepository.findReaderVoteByPeriodAndIdentity(
        body.surveyPeriodId,
        identityHash,
        voteType
      )
      if (existingVote) throw ReaderAlreadyVotedException

      // Spec 15 Part C: IP quota has already passed; reject a bad token before OTP validation/burn.
      const captcha = await this.recaptchaService.verify(body.captchaToken, ip)
      if (!captcha.ok) throw CaptchaRejectedException

      // Low score remains a valid but down-weighted vote. Google outage fails open and is flagged for review;
      // local dev (score null, not degraded) preserves the pre-Spec-15 behavior.
      const lowScore = captcha.score != null && captcha.score < config.captchaThreshold
      const weight = lowScore ? SURVEY_CONFIG.voteWeightForFlagged : 1
      const isFlagged = lowScore || captcha.degraded

      await this.surveyOtpService.createVoteWithOtp({
        identity: body.identity,
        code: body.otpCode,
        maxAttempts: config.otpMaxAttempts,
        vote: {
          surveyPeriodId: body.surveyPeriodId,
          seriesIds: body.seriesIds,
          identityHash,
          publicationType: voteType,
          authMethod: 'EMAIL_OTP',
          ipHash,
          captchaScore: captcha.score,
          voteWeight: weight,
          isFlagged
        }
      })

      // Realtime is post-commit and best-effort. VoteGateway normally contains
      // socket/Redis errors itself; this boundary also protects vote success if
      // that side-effect implementation is ever replaced or misconfigured.
      try {
        await this.voteGateway.broadcastTally(body.surveyPeriodId)
      } catch {
        // The persisted vote is authoritative; realtime delivery is optional.
      }
    } catch (error) {
      // Refund reservation — phiếu không ghi được thì không được chiếm quota.
      if (reservedCount != null) await this.redisService.decrSafe(ipQuotaKey)
      throw error
    }

    return { message: SurveyMessages.response.voteSubmitted }
  }
}
