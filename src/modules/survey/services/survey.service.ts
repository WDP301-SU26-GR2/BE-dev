import { Injectable } from '@nestjs/common'
import { NotificationType, AuditEntityType, PublicationType } from '@prisma/client'
import { SurveyRepository } from '../survey.repo'
import { SurveyMessages } from '../survey.messages'
import {
  SurveyPeriodNotFoundException,
  SurveyPeriodNotOpenException,
  SurveyPeriodAlreadyFinalizedException,
  SurveyPeriodNotFinalizedException,
  ReaderAlreadyVotedException,
  VoteOtpNotFoundException,
  VoteOtpRateLimitException,
  VoteIpLimitExceededException,
  SurveyDataImportNotAllowedException,
  RankingFinalizeNotAllowedException,
  TooManySeriesSelectedException,
  DuplicateSeriesInVoteException,
  SeriesNotVotableException,
  RankingAccessDeniedException,
  SeriesNotFoundForRankingException,
  CaptchaRejectedException
} from '../errors/survey.errors'
import {
  CreateSurveyPeriodBodyDto,
  ImportSurveyDataBodyDto,
  ReaderVoteBodyDto,
  UpdateSurveyPeriodStatusBodyDto,
  VoteOtpRequestBodyDto,
  VotingConfigBodyDto
} from '../dto/survey.dto'
import { AuthOtpService } from 'src/modules/auth/services/auth-otp.service'
import { OtpPurpose } from 'src/modules/auth/auth.constant'
import { IdentityHashService } from 'src/infrastructure/crypto/identity-hash.service'
import { RateLimitService } from 'src/core/security/services/rate-limit.service'
import { SURVEY_CONFIG, VOTE_IP_QUOTA_TTL_SEC } from '../survey.constant'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { DomainEvent } from 'src/core/events/domain-events'
import { NotificationService } from 'src/modules/notification/notification.service'
import { AppConfigService } from 'src/modules/app-config/app-config.service'
import { SurveyConfigService } from './survey-config.service'
import { bottomThirdCount, computeRiskLevel, nextConsecutiveCount } from './ranking-finalize.helpers'
import { AuditService } from 'src/modules/audit/audit.service'
import { RecaptchaService } from 'src/infrastructure/captcha/recaptcha.service'
import { RedisService } from 'src/infrastructure/redis/redis.service'

// B-VOT-07 / Spec 5: per-period reliability threshold uses AppConfig.lowVoteReliabilityThreshold
// (read at finalize time, not a static constant) — this constant is the SEED default for AppConfig
// when no row exists, matching schema @default() and the spec.
const DEFAULT_LOW_VOTE_RELIABILITY_THRESHOLD = 10

// 24-hex ObjectId guard — must guard every route/param that hits Prisma where: { id } on ObjectId fields
// to avoid P2023 (malformed id) → 500. Mirrors the pattern from series-query/admin-user-query.
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class SurveyService {
  constructor(
    private readonly surveyRepository: SurveyRepository,
    private readonly authOtpService: AuthOtpService,
    private readonly identityHashService: IdentityHashService,
    private readonly rateLimitService: RateLimitService,
    private readonly domainEventBus: DomainEventBus,
    private readonly notificationService: NotificationService,
    private readonly surveyConfigService: SurveyConfigService,
    private readonly appConfigService: AppConfigService,
    private readonly auditService: AuditService,
    private readonly recaptchaService: RecaptchaService,
    private readonly redisService: RedisService
  ) {}

  private mapSurveyPeriod(surveyPeriod: {
    id: string
    issueNumber: number | null
    reflectedIssueNumber: number | null
    startDate: Date | null
    endDate: Date | null
    status: string
  }) {
    if (!surveyPeriod.startDate || !surveyPeriod.endDate) {
      throw new Error('Survey period startDate and endDate must be present.')
    }

    return {
      id: surveyPeriod.id,
      issueNumber: surveyPeriod.issueNumber ?? undefined,
      reflectedIssueNumber: surveyPeriod.reflectedIssueNumber ?? undefined,
      startDate: surveyPeriod.startDate.toISOString(),
      endDate: surveyPeriod.endDate.toISOString(),
      status: surveyPeriod.status as 'DRAFT' | 'OPEN' | 'CLOSED' | 'REFLECTED'
    }
  }

  private mapVotingConfig(config: {
    id: string
    authMode: string
    maxSeriesPerVote: number
    otpExpirySeconds: number
    otpMaxAttempts: number
    ipRateLimit: number
    phoneRateLimit: number
    otpCooldownSeconds: number
    ipVotesPerPeriod: number
    captchaThreshold: number
    updatedAt: Date
  }) {
    return {
      id: config.id,
      authMode: config.authMode as 'OTP' | 'CAPTCHA' | 'HYBRID',
      maxSeriesPerVote: config.maxSeriesPerVote,
      otpExpirySeconds: config.otpExpirySeconds,
      otpMaxAttempts: config.otpMaxAttempts,
      ipRateLimit: config.ipRateLimit,
      phoneRateLimit: config.phoneRateLimit,
      otpCooldownSeconds: config.otpCooldownSeconds,
      ipVotesPerPeriod: config.ipVotesPerPeriod,
      captchaThreshold: config.captchaThreshold,
      updatedAt: config.updatedAt.toISOString()
    }
  }

  private mapRankingItem(r: {
    seriesId: string
    rankPosition: number | null
    voteCount: number
    previousRank: number | null
    rankChange: number | null
    isAtRisk: boolean
    riskLevel: string
    isReliable: boolean
    recordedAt: Date
  }) {
    return {
      seriesId: r.seriesId,
      rankPosition: r.rankPosition ?? undefined,
      voteCount: r.voteCount,
      previousRank: r.previousRank,
      rankChange: r.rankChange,
      isAtRisk: r.isAtRisk,
      riskLevel: r.riskLevel as 'NONE' | 'LOW' | 'MEDIUM' | 'SEVERE',
      isReliable: r.isReliable,
      recordedAt: r.recordedAt.toISOString()
    }
  }

  async requestOtp(body: VoteOtpRequestBodyDto, ip: string) {
    // B-VOT-06: rate-limit quota đọc từ VotingConfig DB (admin có thể giảm/tăng qua PATCH).
    const config = await this.surveyConfigService.get()

    // 1. Kiểm tra Rate Limit theo identity email
    const identityLimit = await this.rateLimitService.checkAndConsume({
      key: `survey:otp:identity:${body.identity}`,
      max: config.phoneRateLimit,
      windowSec: 86400,
      cooldownSec: config.otpCooldownSeconds
    })
    if (!identityLimit.allowed) {
      throw VoteOtpRateLimitException(identityLimit.retryAfter)
    }

    // 2. Kiểm tra Rate Limit theo IP gán cho Guest
    const ipLimit = await this.rateLimitService.checkAndConsume({
      key: `survey:otp:ip:${ip}`,
      max: config.ipRateLimit,
      windowSec: 86400
    })
    if (!ipLimit.allowed) {
      throw VoteOtpRateLimitException(ipLimit.retryAfter)
    }

    // Spec 15 Part C: block invalid/low-score captcha before sending OTP.
    // score=null is dev/degraded fail-open behavior from RecaptchaService.
    const captcha = await this.recaptchaService.verify(body.captchaToken, ip)
    if (!captcha.ok || (captcha.score != null && captcha.score < config.captchaThreshold)) {
      throw CaptchaRejectedException
    }

    // 3. Tận dụng hàm sendOTPService của AuthOtpService.
    // Vì OtpPurpose.VOTE không nằm trong nhóm kiểm tra User (như REGISTER/FORGOT_PASSWORD),
    // luồng xử lý sẽ đi thẳng vào hàm issueOtp nội bộ và tự động enqueue gửi SMS/Email.
    await this.authOtpService.sendOTPService({
      email: body.identity,
      purpose: OtpPurpose.VOTE
    })

    return { message: SurveyMessages.response.otpSent }
  }

  async submitVote(body: ReaderVoteBodyDto, ip: string) {
    // B-VOT-06: captcha threshold + maxSeriesPerVote từ VotingConfig DB.
    const config = await this.surveyConfigService.get()

    // Enforce maxSeriesPerVote từ config (admin có thể giảm xuống dưới 3 nhưng không vượt 3 —
    // schema .max(3) là trần cứng Requiment §1.15, cấu hình chỉ có ý nghĩa "giảm dưới 3").
    if (body.seriesIds.length > config.maxSeriesPerVote) {
      throw TooManySeriesSelectedException
    }

    // Spec 11 §1.1: guard body.surveyPeriodId TRƯỚC khi đụng Prisma/OTP — id rác sẽ throw P2023 (500)
    // nếu lọt tới repo, và không được đốt OTP của độc giả.
    if (!OBJECT_ID_RE.test(body.surveyPeriodId)) throw SurveyPeriodNotFoundException

    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(body.surveyPeriodId)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    if (surveyPeriod.status !== 'OPEN') throw SurveyPeriodNotOpenException

    // PB-03 (6): seriesIds không trùng + mọi series phải đang SERIALIZED (validate app-layer —
    // seriesIds là N-N không FK cứng; id rác đưa thẳng vào Prisma `in` sẽ P2023 → 500).
    // Validate TRƯỚC bước OTP để phiếu không hợp lệ không đốt OTP của độc giả,
    // và series rác không lọt vào ranking lúc finalize.
    if (new Set(body.seriesIds).size !== body.seriesIds.length) throw DuplicateSeriesInVoteException
    if (body.seriesIds.some((id) => !OBJECT_ID_RE.test(id))) throw SeriesNotVotableException
    const votableSeries = await this.surveyRepository.findSeriesOwnershipByIds(body.seriesIds)
    const votableStatusById = new Map<string, string>(
      votableSeries.map((s): [string, string] => [String(s.id), String(s.status)])
    )
    if (body.seriesIds.some((id) => votableStatusById.get(id) !== 'SERIALIZED')) throw SeriesNotVotableException

    // Deterministic HMAC (NOT bcrypt) so the (surveyPeriodId, identityHash) dedup + unique
    // constraint actually catch repeat votes — see B-VOT-03 fix / IdentityHashService.
    const identityHash = this.identityHashService.hash(body.identity)
    const ipHash = this.identityHashService.hash(ip)

    // Lớp 1 (nguồn sự thật steady-state): đếm phiếu ĐÃ GHI trong DB — đúng cả khi Redis flush/restart.
    const ipVotes = await this.surveyRepository.countReaderVotesByPeriodAndIp(body.surveyPeriodId, ipHash)
    if (ipVotes >= config.ipVotesPerPeriod) throw VoteIpLimitExceededException

    // Lớp 2 (Spec 15.1 hardening): count → insert KHÔNG nguyên tử — 2 request song song sát trần cùng
    // thấy count < cap rồi cùng insert → vượt quota 1 phiếu. Reservation Redis INCR (Lua + TTL) đóng
    // race này; Redis lỗi → null → FAIL-OPEN về lớp 1 (triết lý AGENTS §10). Refund khi phiếu KHÔNG
    // ghi được (409/403/OTP sai) để quota giữ ngữ nghĩa cũ: chỉ đếm phiếu ghi thật.
    const ipQuotaKey = `survey:vote:ipq:${body.surveyPeriodId}:${ipHash}`
    const reservedCount = await this.redisService.incrWithTtl(ipQuotaKey, VOTE_IP_QUOTA_TTL_SEC)
    if (reservedCount != null && reservedCount > config.ipVotesPerPeriod) {
      await this.redisService.decrSafe(ipQuotaKey)
      throw VoteIpLimitExceededException
    }

    try {
      const existingVote = await this.surveyRepository.findReaderVoteByPeriodAndIdentity(
        body.surveyPeriodId,
        identityHash
      )
      if (existingVote) throw ReaderAlreadyVotedException

      // Spec 15 Part C: IP quota has already passed; reject a bad token before OTP validation/burn.
      const captcha = await this.recaptchaService.verify(body.captchaToken, ip)
      if (!captcha.ok) throw CaptchaRejectedException

      try {
        // Xác thực mã OTP thông qua AuthOtpService công khai
        await this.authOtpService.validateOtpCode({
          email: body.identity,
          code: body.otpCode,
          purpose: OtpPurpose.VOTE
        })
      } catch {
        // Bọc lại mã lỗi tương ứng theo thiết kế lỗi phân hệ Survey
        throw VoteOtpNotFoundException
      }

      // Hủy OTP ngay lập tức sau khi xác thực thành công (Single-use OTP)
      await this.authOtpService.burnOtp(body.identity, OtpPurpose.VOTE)

      // Low score remains a valid but down-weighted vote. Google outage fails open and is flagged for review;
      // local dev (score null, not degraded) preserves the pre-Spec-15 behavior.
      const lowScore = captcha.score != null && captcha.score < config.captchaThreshold
      const weight = lowScore ? SURVEY_CONFIG.voteWeightForFlagged : 1
      const isFlagged = lowScore || captcha.degraded

      await this.surveyRepository.createReaderVote({
        surveyPeriodId: body.surveyPeriodId,
        seriesIds: body.seriesIds,
        identityHash,
        authMethod: 'EMAIL_OTP',
        ipHash,
        captchaScore: captcha.score,
        voteWeight: weight,
        isFlagged
      })
    } catch (error) {
      // Refund reservation — phiếu không ghi được thì không được chiếm quota.
      if (reservedCount != null) await this.redisService.decrSafe(ipQuotaKey)
      throw error
    }

    return { message: SurveyMessages.response.voteSubmitted }
  }

  async getSurveyPeriods() {
    const surveyPeriods = await this.surveyRepository.findManySurveyPeriods()
    return surveyPeriods.map((period) => this.mapSurveyPeriod(period))
  }

  async getSurveyPeriodById(id: string) {
    if (!OBJECT_ID_RE.test(id)) throw SurveyPeriodNotFoundException
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(id)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    return this.mapSurveyPeriod(surveyPeriod)
  }

  async getSurveyPeriodVotes(id: string) {
    if (!OBJECT_ID_RE.test(id)) throw SurveyPeriodNotFoundException
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(id)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    return this.surveyRepository.getReaderVotesByPeriod(id)
  }

  async getSurveyPeriodSurveyData(id: string) {
    if (!OBJECT_ID_RE.test(id)) throw SurveyPeriodNotFoundException
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(id)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    return this.surveyRepository.getSurveyDataByPeriod(id)
  }

  async createSurveyPeriod(body: CreateSurveyPeriodBodyDto, userId?: string) {
    const surveyPeriod = await this.surveyRepository.createSurveyPeriod(body)
    if (userId) {
      await this.notificationService.notifySafe({
        recipientId: userId,
        type: NotificationType.SURVEY,
        referenceId: surveyPeriod.id,
        referenceType: 'SURVEY_PERIOD_CREATED',
        content: SurveyMessages.notification.surveyPeriodCreated
      })
    }
    return this.mapSurveyPeriod(surveyPeriod)
  }

  async updateSurveyPeriodStatus(id: string, body: UpdateSurveyPeriodStatusBodyDto, userId?: string) {
    if (!OBJECT_ID_RE.test(id)) throw SurveyPeriodNotFoundException
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(id)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    const updated = await this.surveyRepository.updateSurveyPeriodStatus(id, body.status)
    await this.auditService.record({
      actorId: userId ?? null,
      entityType: AuditEntityType.SURVEY_PERIOD,
      entityId: id,
      action: 'TRANSITION',
      fromState: surveyPeriod.status,
      toState: body.status
    })
    if (userId) {
      await this.notificationService.notifySafe({
        recipientId: userId,
        type: NotificationType.SURVEY,
        referenceId: updated.id,
        referenceType: 'SURVEY_PERIOD_STATUS_UPDATED',
        content: SurveyMessages.notification.surveyPeriodStatusUpdated
      })
    }
    return this.mapSurveyPeriod(updated)
  }

  async importSurveyData(body: ImportSurveyDataBodyDto, userId: string) {
    // Spec 11 §1.1: guard body.surveyPeriodId TRƯỚC khi đụng Prisma — id rác sẽ throw P2023 (500).
    if (!OBJECT_ID_RE.test(body.surveyPeriodId)) throw SurveyPeriodNotFoundException

    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(body.surveyPeriodId)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    if (surveyPeriod.status !== 'CLOSED') throw SurveyDataImportNotAllowedException
    await this.surveyRepository.createSurveyData({ ...body, importedBy: userId })
    await this.notificationService.notifySafe({
      recipientId: userId,
      type: NotificationType.SURVEY,
      referenceId: surveyPeriod.id,
      referenceType: 'SURVEY_DATA_IMPORTED',
      content: SurveyMessages.notification.surveyDataImported
    })
    return { message: SurveyMessages.response.surveyDataImported }
  }

  async finalizeRanking(surveyPeriodId: string, userId?: string) {
    if (!OBJECT_ID_RE.test(surveyPeriodId)) throw SurveyPeriodNotFoundException
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(surveyPeriodId)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    if (surveyPeriod.status === 'REFLECTED') throw SurveyPeriodAlreadyFinalizedException
    if (surveyPeriod.status !== 'CLOSED') throw RankingFinalizeNotAllowedException

    const surveyData = await this.surveyRepository.getSurveyDataByPeriod(surveyPeriodId)
    const readerVotes = await this.surveyRepository.getReaderVotesByPeriod(surveyPeriodId)
    const previousPeriod = await this.surveyRepository.findPreviousSurveyPeriod(surveyPeriodId)
    const previousRecords = previousPeriod
      ? await this.surveyRepository.getRankingRecordsByPeriod(previousPeriod.id)
      : []

    // 1. Merge 2 nguồn cùng thang đo (giữ logic cũ) — seriesScores là Map từ seriesId → {score, offlineVotes}
    const seriesScores = new Map<string, { score: number; offlineVotes: number }>()

    const addSeriesScore = (seriesId: string, deltaScore: number, deltaOfflineVotes = 0) => {
      const current = seriesScores.get(seriesId) ?? { score: 0, offlineVotes: 0 }
      current.score += deltaScore
      current.offlineVotes += deltaOfflineVotes
      seriesScores.set(seriesId, current)
    }

    for (const data of surveyData) {
      for (const entry of data.entries) {
        if (!entry.seriesId) continue
        addSeriesScore(entry.seriesId, entry.voteCount, entry.voteCount)
      }
    }

    for (const vote of readerVotes) {
      for (const seriesId of vote.seriesIds) {
        addSeriesScore(seriesId, vote.voteWeight)
      }
    }

    const rankingItems = Array.from(seriesScores.entries()).map(([seriesId, value]) => ({
      seriesId,
      score: value.score,
      offlineVotes: value.offlineVotes
    }))

    rankingItems.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.offlineVotes !== a.offlineVotes) return b.offlineVotes - a.offlineVotes
      const prevRankA =
        previousRecords.find((record) => record.seriesId === a.seriesId)?.rankPosition ?? Number.MAX_SAFE_INTEGER
      const prevRankB =
        previousRecords.find((record) => record.seriesId === b.seriesId)?.rankPosition ?? Number.MAX_SAFE_INTEGER
      return prevRankA - prevRankB
    })

    // 2. B-VOT-05: gather context for at-risk + reliability evaluation.
    // Read AppConfig + VotingConfig once (cached 30s in services).
    const appConfig = await this.appConfigService.get()
    const seriesIds = rankingItems.map((i) => i.seriesId)
    const publishedCounts =
      seriesIds.length > 0 ? await this.surveyRepository.countPublishedChaptersBySeriesIds(seriesIds) : new Map()
    const ownership = seriesIds.length > 0 ? await this.surveyRepository.findSeriesOwnershipByIds(seriesIds) : []
    const statusById = new Map(ownership.map((o) => [o.id, o.status]))
    const heldThreshold = new Date(Date.now() - appConfig.hiatusTooLongDays * 86_400_000)
    const heldSeries =
      seriesIds.length > 0
        ? await this.surveyRepository.findHeldChapterSeriesIds(seriesIds, heldThreshold)
        : new Set<string>()

    // 3. Compute per-record state — Spec 5 §3 (tiering) + §4 (reliability).
    const N = rankingItems.length
    const bottom = bottomThirdCount(N)
    const periodTotal = rankingItems.reduce((s, i) => s + i.score, 0)
    const periodLowData = periodTotal < appConfig.lowVoteReliabilityThreshold

    // 4. Materialize RankingRecord rows + collect per-series result for notify (Task 8).
    const perSeriesResult: Array<{ seriesId: string; isAtRisk: boolean; riskLevel: string }> = []
    const severeSeriesIds: string[] = []

    for (let index = 0; index < rankingItems.length; index++) {
      const item = rankingItems[index]
      const previous = previousRecords.find((record) => record.seriesId === item.seriesId)
      const previousRank = previous?.rankPosition ?? null
      const rankChange = previousRank != null ? previousRank - (index + 1) : null

      // B-VOT-05: loại trừ khỏi at-risk nếu <8 chương PUBLISHED hoặc series HIATUS.
      // Spec 5 §3 "reset" rule: khi bị loại trừ → reset consecutiveAtRiskCount về 0 (không carry/freeze).
      const excluded =
        (publishedCounts.get(item.seriesId) ?? 0) < SURVEY_CONFIG.minChaptersForRiskEvaluation ||
        statusById.get(item.seriesId) === 'HIATUS'

      const isAtRisk = !excluded && index >= N - bottom
      const prevCount = previous?.consecutiveAtRiskCount ?? 0
      const consecutiveAtRiskCount = nextConsecutiveCount(prevCount, isAtRisk)
      const riskLevel = computeRiskLevel(isAtRisk, consecutiveAtRiskCount)
      // B-VOT-07: per-period (lowData) + per-series (long-held chapter) → isReliable.
      const isReliable = !periodLowData && !heldSeries.has(item.seriesId)

      await this.surveyRepository.createRankingRecord({
        seriesId: item.seriesId,
        surveyPeriodId,
        rankPosition: index + 1,
        voteCount: item.score,
        previousRank,
        rankChange,
        isAtRisk,
        riskLevel,
        consecutiveAtRiskCount,
        isReliable
      })

      perSeriesResult.push({ seriesId: item.seriesId, isAtRisk, riskLevel })
      if (riskLevel === 'SEVERE') severeSeriesIds.push(item.seriesId)
    }

    await this.surveyRepository.updateSurveyPeriodStatus(surveyPeriodId, 'REFLECTED')
    await this.auditService.record({
      actorId: userId ?? null,
      entityType: AuditEntityType.SURVEY_PERIOD,
      entityId: surveyPeriodId,
      action: 'RANKING_FINALIZED'
    })
    if (userId) {
      await this.notificationService.notifySafe({
        recipientId: userId,
        type: NotificationType.SURVEY,
        referenceId: surveyPeriodId,
        referenceType: 'SURVEY_RANKING_FINALIZED',
        content: SurveyMessages.notification.rankingFinalized
      })
    }

    // 5. B-VOT-05 AC5 + B-VOT-07: notify Mangaka/Editor/Board, bỏ qua nếu kỳ thiếu dữ liệu.
    if (!periodLowData) {
      await this.notifyRankingOutcome(perSeriesResult, ownership, severeSeriesIds)
    }

    this.domainEventBus.emit(DomainEvent.RankingFinalized, {
      surveyPeriodId,
      rankings: rankingItems.map((item, index) => ({ seriesId: item.seriesId, rank: index + 1 }))
    })
    return { message: SurveyMessages.response.rankingFinalized }
  }

  // B-VOT-05 AC5 + B-VOT-07: fan-out notify cho 3 role.
  //  - Mangaka của từng series at-risk: cảnh báo + riskLevel.
  //  - Editor phụ trách (nếu có) của series at-risk: cùng nội dung.
  //  - Board: 1 thông báo tổng hợp SEVERE digest (bỏ qua nếu không có SEVERE).
  private async notifyRankingOutcome(
    results: Array<{ seriesId: string; isAtRisk: boolean; riskLevel: string }>,
    ownership: Array<{ id: string; mangakaId: string; editorId: string | null }>,
    severe: string[]
  ): Promise<void> {
    const ownerById = new Map(ownership.map((o) => [o.id, o]))

    for (const r of results) {
      if (!r.isAtRisk) continue
      const owner = ownerById.get(r.seriesId)
      if (!owner) continue
      await this.notificationService.notifySafe({
        recipientId: owner.mangakaId,
        type: NotificationType.SURVEY,
        referenceId: r.seriesId,
        referenceType: 'RANKING_AT_RISK',
        content: SurveyMessages.notification.rankingAtRisk
      })
      if (owner.editorId) {
        await this.notificationService.notifySafe({
          recipientId: owner.editorId,
          type: NotificationType.SURVEY,
          referenceId: r.seriesId,
          referenceType: 'RANKING_AT_RISK',
          content: SurveyMessages.notification.rankingAtRisk
        })
      }
    }

    if (severe.length > 0) {
      const boardIds = await this.surveyRepository.findBoardMemberIds()
      for (const boardId of boardIds) {
        await this.notificationService.notifySafe({
          recipientId: boardId,
          type: NotificationType.SURVEY,
          referenceId: severe[0],
          referenceType: 'RANKING_SEVERE_DIGEST',
          content: SurveyMessages.notification.rankingSevereDigest(severe.length)
        })
      }
    }
  }

  async getRankingRecords(surveyPeriodId: string) {
    if (!OBJECT_ID_RE.test(surveyPeriodId)) throw SurveyPeriodNotFoundException
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(surveyPeriodId)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    const items = await this.surveyRepository.getRankingRecordsByPeriod(surveyPeriodId)
    return {
      items: items.map((item) => ({
        seriesId: item.seriesId,
        voteCount: item.voteCount,
        rankPosition: item.rankPosition ?? undefined,
        previousRank: item.previousRank,
        rankChange: item.rankChange,
        isAtRisk: item.isAtRisk,
        riskLevel: item.riskLevel ?? 'NONE',
        consecutiveAtRiskCount: item.consecutiveAtRiskCount ?? 0,
        isReliable: item.isReliable
      }))
    }
  }

  // PB-04: bảng xếp hạng toàn tạp chí 1 kỳ — FULL cho mọi role nội bộ (không scope theo owner).
  // Mangaka cần thấy hạng mình so với series khác; ranking tổng hợp không nhạy cảm per-series.
  async getBoardRanking(surveyPeriodId: string) {
    if (!OBJECT_ID_RE.test(surveyPeriodId)) throw SurveyPeriodNotFoundException
    const period = await this.surveyRepository.findSurveyPeriodById(surveyPeriodId)
    if (!period) throw SurveyPeriodNotFoundException
    const items = await this.surveyRepository.getRankingRecordsByPeriod(surveyPeriodId)
    const sorted = [...items].sort((a, b) => (a.rankPosition ?? 0) - (b.rankPosition ?? 0))
    return { items: sorted.map((r) => this.mapRankingItem(r as never)) }
  }

  // PB-04: trend xếp hạng 1 series — scoping theo owner.
  // MANGAKA phải là mangakaId; EDITOR phải là editorId; BOARD/ADMIN mọi series.
  async getSeriesTrend(seriesId: string, periods: number, caller: { userId: string; roleName: string }) {
    if (!OBJECT_ID_RE.test(seriesId)) throw SeriesNotFoundForRankingException
    const [owner] = await this.surveyRepository.findSeriesOwnershipByIds([seriesId])
    if (!owner) throw SeriesNotFoundForRankingException
    const role = caller.roleName
    const allowed =
      role === 'BOARD_MEMBER' ||
      role === 'SUPER_ADMIN' ||
      (role === 'MANGAKA' && owner.mangakaId === caller.userId) ||
      (role === 'EDITOR' && owner.editorId === caller.userId)
    if (!allowed) throw RankingAccessDeniedException
    const items = await this.surveyRepository.getRankingRecordsBySeries(seriesId, periods)
    return { items: items.map((r) => this.mapRankingItem(r as never)) }
  }

  // B-VOT-06: VotingConfig read cached via SurveyConfigService (lazy-seed §1.15).
  async getVotingConfig() {
    const config = await this.surveyConfigService.get()
    return this.mapVotingConfig(config)
  }

  // B-VOT-06: PATCH ghi DB + invalidate cache → caller tiếp theo đọc config mới.
  async updateVotingConfig(body: VotingConfigBodyDto) {
    const config = await this.surveyRepository.updateVotingConfig({
      authMode: body.authMode,
      maxSeriesPerVote: body.maxSeriesPerVote,
      otpExpirySeconds: body.otpExpirySeconds,
      otpMaxAttempts: body.otpMaxAttempts,
      ipRateLimit: body.ipRateLimit,
      phoneRateLimit: body.phoneRateLimit,
      otpCooldownSeconds: body.otpCooldownSeconds,
      ipVotesPerPeriod: body.ipVotesPerPeriod,
      captchaThreshold: body.captchaThreshold
    })
    this.surveyConfigService.invalidate()
    return this.mapVotingConfig(config)
  }

  // Fix-1 G-2 (Req 2.5#1): dữ liệu public dựng trang bình chọn — KHÔNG cần auth, KHÔNG lộ field nội bộ.
  async getVoteContext() {
    const config = await this.surveyConfigService.get()
    const period = await this.surveyRepository.findLatestOpenSurveyPeriod()
    if (!period) return { period: null, series: [], maxSeriesPerVote: config.maxSeriesPerVote }
    const series = await this.surveyRepository.findManySerializedSeriesPublic()
    return {
      period: {
        id: period.id,
        issueNumber: period.issueNumber ?? null,
        reflectedIssueNumber: period.reflectedIssueNumber ?? null,
        startDate: period.startDate ? period.startDate.toISOString() : null,
        endDate: period.endDate ? period.endDate.toISOString() : null
      },
      series: series.map((s) => ({
        id: s.id,
        title: s.title,
        coverImage: s.coverImage ?? null,
        genres: s.genres,
        demographic: s.demographic ?? null
      })),
      maxSeriesPerVote: config.maxSeriesPerVote
    }
  }

  // Spec 15 §3.1 — public discovery without requiring a known surveyPeriodId.
  async getLatestVoteResults(publicationType?: PublicationType) {
    const period = await this.surveyRepository.findLatestReflectedPeriod()
    if (!period) return { period: null, results: [] }
    const base = await this.getVoteResults(period.id, publicationType)
    return {
      period: {
        id: period.id,
        issueNumber: period.issueNumber ?? null,
        reflectedIssueNumber: period.reflectedIssueNumber ?? null,
        startDate: period.startDate?.toISOString() ?? null,
        endDate: period.endDate?.toISOString() ?? null
      },
      results: base.results
    }
  }

  // Spec 15 §3.2 — expose reflected history only, never operational periods.
  async getReflectedPeriods(limit: number) {
    const rows = await this.surveyRepository.findReflectedPeriods(limit)
    return {
      items: rows.map((period) => ({
        id: period.id,
        issueNumber: period.issueNumber ?? null,
        reflectedIssueNumber: period.reflectedIssueNumber ?? null,
        startDate: period.startDate?.toISOString() ?? null,
        endDate: period.endDate?.toISOString() ?? null
      }))
    }
  }

  // Fix-1 G-2 (Req 2.5#3): kết quả public — chỉ sau khi kỳ REFLECTED; ẩn tín hiệu biên tập nội bộ.
  // Spec 15.2: filter optional theo publicationType (bảng con WEEKLY/MONTHLY) — rankPosition GIỮ NGUYÊN
  // vị trí trên bảng tổng (1 kỳ = 1 bảng xếp hạng chung, đúng mô hình tạp chí); FE tự đánh số thứ tự
  // trong bảng con theo index nếu muốn hiển thị 1..N.
  async getVoteResults(surveyPeriodId: string, publicationType?: PublicationType) {
    if (!OBJECT_ID_RE.test(surveyPeriodId)) throw SurveyPeriodNotFoundException
    const period = await this.surveyRepository.findSurveyPeriodById(surveyPeriodId)
    if (!period) throw SurveyPeriodNotFoundException
    if (period.status !== 'REFLECTED') throw SurveyPeriodNotFinalizedException
    const records = await this.surveyRepository.getRankingRecordsByPeriod(surveyPeriodId)
    const titles = await this.surveyRepository.findSeriesTitlesByIds(records.map((r) => r.seriesId))
    const seriesById = new Map<string, { title: string; publicationType: PublicationType | null }>(
      titles.map(
        (t: { id: string; title: string; publicationType: PublicationType | null }) =>
          [t.id, { title: t.title, publicationType: t.publicationType ?? null }] as [
            string,
            { title: string; publicationType: PublicationType | null }
          ]
      )
    )
    const results = records
      .map((r) => ({
        rankPosition: r.rankPosition ?? null,
        seriesId: r.seriesId,
        seriesTitle: seriesById.get(r.seriesId)?.title ?? null,
        publicationType: seriesById.get(r.seriesId)?.publicationType ?? null,
        voteCount: r.voteCount,
        rankChange: r.rankChange ?? null
      }))
      .filter((r) => !publicationType || r.publicationType === publicationType)
    return {
      surveyPeriodId,
      issueNumber: period.issueNumber ?? null,
      results
    }
  }
}

// Re-export the constant for legacy imports (e.g. spec mocks) — keeps external surface unchanged.
export { DEFAULT_LOW_VOTE_RELIABILITY_THRESHOLD }
