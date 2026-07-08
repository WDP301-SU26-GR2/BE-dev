import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { SurveyRepository } from '../survey.repo'
import { SurveyMessages } from '../survey.messages'
import {
  SurveyPeriodNotFoundException,
  SurveyPeriodNotOpenException,
  SurveyPeriodAlreadyFinalizedException,
  ReaderAlreadyVotedException,
  VoteOtpNotFoundException,
  VoteOtpRateLimitException,
  SurveyDataImportNotAllowedException,
  RankingFinalizeNotAllowedException,
  VotingConfigNotFoundException
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
import { HashingService } from 'src/infrastructure/crypto/hashing.service'
import { RateLimitService } from 'src/core/security/services/rate-limit.service'
import { SURVEY_CONFIG } from '../survey.constant'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { DomainEvent } from 'src/core/events/domain-events'
import { NotificationService } from 'src/modules/notification/notification.service'

@Injectable()
export class SurveyService {
  constructor(
    private readonly surveyRepository: SurveyRepository,
    private readonly authOtpService: AuthOtpService,
    private readonly hashingService: HashingService,
    private readonly rateLimitService: RateLimitService,
    private readonly domainEventBus: DomainEventBus,
    private readonly notificationService: NotificationService
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
      captchaThreshold: config.captchaThreshold,
      updatedAt: config.updatedAt.toISOString()
    }
  }

  async requestOtp(body: VoteOtpRequestBodyDto, ip: string) {
    // 1. Kiểm tra Rate Limit theo Số điện thoại
    const phoneLimit = await this.rateLimitService.checkAndConsume({
      key: `survey:otp:phone:${body.phoneNumber}`,
      max: SURVEY_CONFIG.otpRequestLimitPerPhonePerDay,
      windowSec: 86400
    })
    if (!phoneLimit.allowed) {
      throw VoteOtpRateLimitException
    }

    // 2. Kiểm tra Rate Limit theo IP gán cho Guest
    const ipLimit = await this.rateLimitService.checkAndConsume({
      key: `survey:otp:ip:${ip}`,
      max: SURVEY_CONFIG.otpRequestLimitPerIpPerDay,
      windowSec: 86400
    })
    if (!ipLimit.allowed) {
      throw VoteOtpRateLimitException
    }

    // 3. Tận dụng hàm sendOTPService của AuthOtpService.
    // Vì OtpPurpose.VOTE không nằm trong nhóm kiểm tra User (như REGISTER/FORGOT_PASSWORD),
    // luồng xử lý sẽ đi thẳng vào hàm issueOtp nội bộ và tự động enqueue gửi SMS/Email.
    await this.authOtpService.sendOTPService({
      email: body.phoneNumber, // Map phoneNumber vào trường định danh email của AuthOtpService
      purpose: OtpPurpose.VOTE
    })

    return { message: SurveyMessages.response.otpSent }
  }

  async submitVote(body: ReaderVoteBodyDto, ip: string) {
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(body.surveyPeriodId)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    if (surveyPeriod.status !== 'OPEN') throw SurveyPeriodNotOpenException

    const identityHash = await this.hashingService.hash(body.phoneNumber)
    const ipHash = await this.hashingService.hash(ip)

    const existingVote = await this.surveyRepository.findReaderVoteByPeriodAndIdentity(
      body.surveyPeriodId,
      identityHash
    )
    if (existingVote) throw ReaderAlreadyVotedException

    try {
      // Xác thực mã OTP thông qua AuthOtpService công khai
      await this.authOtpService.validateOtpCode({
        email: body.phoneNumber,
        code: body.otpCode,
        purpose: OtpPurpose.VOTE
      })
    } catch {
      // Bọc lại mã lỗi tương ứng theo thiết kế lỗi phân hệ Survey
      throw VoteOtpNotFoundException
    }

    // Hủy OTP ngay lập tức sau khi xác thực thành công (Single-use OTP)
    await this.authOtpService.burnOtp(body.phoneNumber, OtpPurpose.VOTE)

    const isCaptchaFlagged = body.captchaScore != null && body.captchaScore < SURVEY_CONFIG.captchaThreshold
    const weight = isCaptchaFlagged ? SURVEY_CONFIG.voteWeightForFlagged : 1
    const isFlagged = isCaptchaFlagged

    await this.surveyRepository.createReaderVote({
      surveyPeriodId: body.surveyPeriodId,
      seriesIds: body.seriesIds,
      identityHash,
      authMethod: 'PHONE_OTP',
      ipHash,
      captchaScore: body.captchaScore,
      voteWeight: weight,
      isFlagged
    })

    return { message: SurveyMessages.response.voteSubmitted }
  }

  async getSurveyPeriods() {
    const surveyPeriods = await this.surveyRepository.findManySurveyPeriods()
    return surveyPeriods.map((period) => this.mapSurveyPeriod(period))
  }

  async getSurveyPeriodById(id: string) {
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(id)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    return this.mapSurveyPeriod(surveyPeriod)
  }

  async getSurveyPeriodVotes(id: string) {
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(id)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    return this.surveyRepository.getReaderVotesByPeriod(id)
  }

  async getSurveyPeriodSurveyData(id: string) {
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
        content: 'Kỳ bình chọn mới đã được tạo thành công.'
      })
    }
    return this.mapSurveyPeriod(surveyPeriod)
  }

  async updateSurveyPeriodStatus(id: string, body: UpdateSurveyPeriodStatusBodyDto, userId?: string) {
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(id)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    const updated = await this.surveyRepository.updateSurveyPeriodStatus(id, body.status)
    if (userId) {
      await this.notificationService.notifySafe({
        recipientId: userId,
        type: NotificationType.SURVEY,
        referenceId: updated.id,
        referenceType: 'SURVEY_PERIOD_STATUS_UPDATED',
        content: 'Trạng thái kỳ bình chọn đã được cập nhật.'
      })
    }
    return this.mapSurveyPeriod(updated)
  }

  async importSurveyData(body: ImportSurveyDataBodyDto, userId: string) {
    const surveyPeriod = await this.surveyRepository.findSurveyPeriodById(body.surveyPeriodId)
    if (!surveyPeriod) throw SurveyPeriodNotFoundException
    if (surveyPeriod.status !== 'CLOSED') throw SurveyDataImportNotAllowedException
    await this.surveyRepository.createSurveyData({ ...body, importedBy: userId })
    await this.notificationService.notifySafe({
      recipientId: userId,
      type: NotificationType.SURVEY,
      referenceId: surveyPeriod.id,
      referenceType: 'SURVEY_DATA_IMPORTED',
      content: 'Dữ liệu bình chọn offline đã được nhập thành công.'
    })
    return { message: SurveyMessages.response.surveyDataImported }
  }

  async finalizeRanking(surveyPeriodId: string, userId?: string) {
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

    const totalSeries = rankingItems.length
    const bottomThreshold = Math.ceil(totalSeries / 3)

    for (let index = 0; index < rankingItems.length; index++) {
      const item = rankingItems[index]
      const previous = previousRecords.find((record) => record.seriesId === item.seriesId)
      const previousRank = previous?.rankPosition ?? null
      const rankChange = previousRank != null ? previousRank - (index + 1) : null
      const isAtRisk = index >= totalSeries - bottomThreshold
      const isReliable = item.score >= SURVEY_CONFIG.minReliableWeightedVotes

      await this.surveyRepository.createRankingRecord({
        seriesId: item.seriesId,
        surveyPeriodId,
        rankPosition: index + 1,
        voteCount: item.score,
        previousRank,
        rankChange,
        isAtRisk,
        isReliable
      })
    }

    await this.surveyRepository.updateSurveyPeriodStatus(surveyPeriodId, 'REFLECTED')
    if (userId) {
      await this.notificationService.notifySafe({
        recipientId: userId,
        type: NotificationType.SURVEY,
        referenceId: surveyPeriodId,
        referenceType: 'SURVEY_RANKING_FINALIZED',
        content: 'Kết quả xếp hạng kỳ bình chọn đã được tính toán.'
      })
    }
    this.domainEventBus.emit(DomainEvent.RankingFinalized, {
      surveyPeriodId,
      rankings: rankingItems.map((item, index) => ({ seriesId: item.seriesId, rank: index + 1 }))
    })
    return { message: SurveyMessages.response.rankingFinalized }
  }

  async getRankingRecords(surveyPeriodId: string) {
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
        isReliable: item.isReliable
      }))
    }
  }

  async getVotingConfig() {
    const config = await this.surveyRepository.getVotingConfig()
    if (!config) throw VotingConfigNotFoundException
    return this.mapVotingConfig(config)
  }

  async updateVotingConfig(body: VotingConfigBodyDto) {
    const config = await this.surveyRepository.updateVotingConfig({
      authMode: body.authMode,
      maxSeriesPerVote: body.maxSeriesPerVote,
      otpExpirySeconds: body.otpExpirySeconds,
      otpMaxAttempts: body.otpMaxAttempts,
      ipRateLimit: body.ipRateLimit,
      phoneRateLimit: body.phoneRateLimit,
      captchaThreshold: body.captchaThreshold
    })
    return this.mapVotingConfig(config)
  }
}
