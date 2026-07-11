import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { CreateSurveyPeriodBodyDto, ImportSurveyDataBodyDto } from './dto/survey.dto'

@Injectable()
export class SurveyRepository {
  constructor(private readonly prisma: PrismaService) {}

  createSurveyPeriod(data: CreateSurveyPeriodBodyDto) {
    return this.prisma.surveyPeriod.create({
      data: {
        issueNumber: data.issueNumber ?? null,
        reflectedIssueNumber: data.reflectedIssueNumber ?? null,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: data.status ?? 'DRAFT'
      }
    })
  }

  findManySurveyPeriods() {
    return this.prisma.surveyPeriod.findMany({ orderBy: { startDate: 'desc' } })
  }

  findSurveyPeriodById(id: string) {
    return this.prisma.surveyPeriod.findUnique({ where: { id } })
  }

  updateSurveyPeriodStatus(id: string, status: 'OPEN' | 'CLOSED' | 'REFLECTED') {
    return this.prisma.surveyPeriod.update({ where: { id }, data: { status } })
  }

  createReaderVote(data: {
    surveyPeriodId: string
    seriesIds: string[]
    identityHash: string
    authMethod?: 'EMAIL_OTP' | 'PHONE_OTP' | 'CAPTCHA_ONLY' | null
    ipHash?: string
    captchaScore?: number
    voteWeight: number
    isFlagged: boolean
  }) {
    return this.prisma.readerVote.create({
      data: {
        surveyPeriodId: data.surveyPeriodId,
        seriesIds: data.seriesIds,
        identityHash: data.identityHash,
        authMethod: data.authMethod ?? null,
        ipHash: data.ipHash ?? null,
        captchaScore: data.captchaScore ?? null,
        voteWeight: data.voteWeight,
        isFlagged: data.isFlagged
      }
    })
  }

  findReaderVoteByPeriodAndIdentity(surveyPeriodId: string, identityHash: string) {
    return this.prisma.readerVote.findUnique({
      where: { surveyPeriodId_identityHash: { surveyPeriodId, identityHash } }
    })
  }

  countReaderVotesByPeriodAndIp(surveyPeriodId: string, ipHash: string): Promise<number> {
    return this.prisma.readerVote.count({ where: { surveyPeriodId, ipHash } })
  }

  createSurveyData(data: ImportSurveyDataBodyDto & { importedBy: string }) {
    return this.prisma.surveyData.create({
      data: {
        surveyPeriodId: data.surveyPeriodId,
        importedBy: data.importedBy,
        surveyDate: data.surveyDate ? new Date(data.surveyDate) : null,
        entries: data.entries.map((entry) => ({
          seriesId: entry.seriesId,
          voteCount: entry.voteCount
        }))
      }
    })
  }

  createRankingRecord(data: {
    seriesId: string
    surveyPeriodId: string
    rankPosition?: number
    voteCount: number
    previousRank?: number | null
    rankChange?: number | null
    isAtRisk: boolean
    riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'SEVERE'
    consecutiveAtRiskCount: number
    isReliable: boolean
  }) {
    return this.prisma.rankingRecord.create({
      data: {
        seriesId: data.seriesId,
        surveyPeriodId: data.surveyPeriodId,
        rankPosition: data.rankPosition ?? null,
        voteCount: data.voteCount,
        previousRank: data.previousRank ?? null,
        rankChange: data.rankChange ?? null,
        isAtRisk: data.isAtRisk,
        riskLevel: data.riskLevel,
        consecutiveAtRiskCount: data.consecutiveAtRiskCount,
        isReliable: data.isReliable
      }
    })
  }

  getSurveyDataByPeriod(surveyPeriodId: string) {
    return this.prisma.surveyData.findMany({ where: { surveyPeriodId } })
  }

  getReaderVotesByPeriod(surveyPeriodId: string) {
    return this.prisma.readerVote.findMany({ where: { surveyPeriodId } })
  }

  getRankingRecordsByPeriod(surveyPeriodId: string) {
    return this.prisma.rankingRecord.findMany({ where: { surveyPeriodId }, orderBy: { rankPosition: 'asc' } })
  }

  // Fix-1 G-2: kỳ OPEN mới nhất cho trang vote public.
  findLatestOpenSurveyPeriod() {
    return this.prisma.surveyPeriod.findFirst({
      where: { status: 'OPEN' },
      orderBy: { startDate: 'desc' }
    })
  }

  // Fix-1 G-2: danh sách series đang phát hành — CHỈ field public-safe, TUYỆT ĐỐI không thêm select.
  findManySerializedSeriesPublic() {
    return this.prisma.series.findMany({
      where: { status: 'SERIALIZED' },
      select: { id: true, title: true, coverImage: true, genres: true, demographic: true },
      orderBy: { title: 'asc' }
    })
  }

  // Fix-1 G-2: map title cho bảng kết quả public.
  findSeriesTitlesByIds(seriesIds: string[]) {
    if (seriesIds.length === 0) return Promise.resolve([])
    return this.prisma.series.findMany({
      where: { id: { in: seriesIds } },
      select: { id: true, title: true }
    })
  }

  // PB-04 trend: N record gần nhất của 1 series (mới→cũ).
  getRankingRecordsBySeries(seriesId: string, take: number) {
    return this.prisma.rankingRecord.findMany({
      where: { seriesId },
      orderBy: { recordedAt: 'desc' },
      take
    })
  }

  // B-VOT-05: đếm chapter PUBLISHED theo từng series → Map<seriesId, count>.
  // Series < ngưỡng → loại khỏi at-risk.
  async countPublishedChaptersBySeriesIds(seriesIds: string[]): Promise<Map<string, number>> {
    if (seriesIds.length === 0) return new Map()
    const grouped = await this.prisma.chapter.groupBy({
      by: ['seriesId'],
      where: { seriesId: { in: seriesIds }, status: 'PUBLISHED' },
      _count: { _all: true }
    })
    return new Map(grouped.map((g) => [g.seriesId, g._count._all]))
  }

  // B-VOT-07: series có chapter đang hold lâu hơn thresholdDate. Composite filter chưa verify ở Mongo →
  // fetch chapter có hold rồi lọc in-memory (Spec 5 §4).
  async findHeldChapterSeriesIds(seriesIds: string[], thresholdDate: Date): Promise<Set<string>> {
    if (seriesIds.length === 0) return new Set()
    const chapters = await this.prisma.chapter.findMany({
      where: { seriesId: { in: seriesIds } },
      select: { seriesId: true, hold: true }
    })
    const result = new Set<string>()
    for (const ch of chapters) {
      if (ch.hold && ch.hold.heldAt && ch.hold.heldAt < thresholdDate) result.add(ch.seriesId)
    }
    return result
  }

  findSeriesOwnershipByIds(seriesIds: string[]) {
    if (seriesIds.length === 0) return Promise.resolve([])
    return this.prisma.series.findMany({
      where: { id: { in: seriesIds } },
      select: { id: true, status: true, mangakaId: true, editorId: true }
    })
  }

  // Board recipients: resolve roleId TRƯỚC (Mongo tránh relation-filter — bám users.repo.ts pattern).
  async findBoardMemberIds(): Promise<string[]> {
    const role = await this.prisma.role.findFirst({ where: { code: 'BOARD_MEMBER' }, select: { id: true } })
    if (!role) return []
    const users = await this.prisma.user.findMany({
      where: { roleId: role.id, deletedAt: { isSet: false } },
      select: { id: true }
    })
    return users.map((u) => u.id)
  }

  findPreviousSurveyPeriod(currentSurveyPeriodId: string) {
    return this.prisma.surveyPeriod.findFirst({
      where: { id: { not: currentSurveyPeriodId }, status: 'REFLECTED' },
      orderBy: { endDate: 'desc' }
    })
  }

  getVotingConfig() {
    return this.prisma.votingConfig.findFirst()
  }

  // B-VOT-06: create row with Requiment §1.15 defaults (lazy-seed by SurveyConfigService).
  // Same defaults as the schema @default() in prisma/schema.prisma.
  createDefaultVotingConfig() {
    return this.prisma.votingConfig.create({
      data: {
        authMode: 'OTP',
        maxSeriesPerVote: 3,
        otpExpirySeconds: 300,
        otpMaxAttempts: 3,
        ipRateLimit: 10,
        phoneRateLimit: 3,
        otpCooldownSeconds: 60,
        ipVotesPerPeriod: 10,
        captchaThreshold: 0.3
      }
    })
  }

  async updateVotingConfig(data: {
    authMode?: 'OTP' | 'CAPTCHA' | 'HYBRID'
    maxSeriesPerVote?: number
    otpExpirySeconds?: number
    otpMaxAttempts?: number
    ipRateLimit?: number
    phoneRateLimit?: number
    otpCooldownSeconds?: number
    ipVotesPerPeriod?: number
    captchaThreshold?: number
  }) {
    const existing = await this.prisma.votingConfig.findFirst()
    if (existing) {
      return this.prisma.votingConfig.update({
        where: { id: existing.id },
        data: {
          authMode: data.authMode ?? existing.authMode,
          maxSeriesPerVote: data.maxSeriesPerVote ?? existing.maxSeriesPerVote,
          otpExpirySeconds: data.otpExpirySeconds ?? existing.otpExpirySeconds,
          otpMaxAttempts: data.otpMaxAttempts ?? existing.otpMaxAttempts,
          ipRateLimit: data.ipRateLimit ?? existing.ipRateLimit,
          phoneRateLimit: data.phoneRateLimit ?? existing.phoneRateLimit,
          otpCooldownSeconds: data.otpCooldownSeconds ?? existing.otpCooldownSeconds,
          ipVotesPerPeriod: data.ipVotesPerPeriod ?? existing.ipVotesPerPeriod,
          captchaThreshold: data.captchaThreshold ?? existing.captchaThreshold
        }
      })
    }

    return this.prisma.votingConfig.create({
      data: {
        authMode: data.authMode ?? 'OTP',
        maxSeriesPerVote: data.maxSeriesPerVote ?? 3,
        otpExpirySeconds: data.otpExpirySeconds ?? 300,
        otpMaxAttempts: data.otpMaxAttempts ?? 3,
        ipRateLimit: data.ipRateLimit ?? 10,
        phoneRateLimit: data.phoneRateLimit ?? 3,
        otpCooldownSeconds: data.otpCooldownSeconds ?? 60,
        ipVotesPerPeriod: data.ipVotesPerPeriod ?? 10,
        captchaThreshold: data.captchaThreshold ?? 0.3
      }
    })
  }
}
