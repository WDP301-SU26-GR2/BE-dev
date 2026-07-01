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
    authMethod?: 'PHONE_OTP' | null
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

  findPreviousSurveyPeriod(currentSurveyPeriodId: string) {
    return this.prisma.surveyPeriod.findFirst({
      where: { id: { not: currentSurveyPeriodId }, status: 'REFLECTED' },
      orderBy: { endDate: 'desc' }
    })
  }

  getVotingConfig() {
    return this.prisma.votingConfig.findFirst()
  }

  async updateVotingConfig(data: {
    authMode?: 'OTP' | 'CAPTCHA' | 'HYBRID'
    maxSeriesPerVote?: number
    otpExpirySeconds?: number
    otpMaxAttempts?: number
    ipRateLimit?: number
    phoneRateLimit?: number
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
          captchaThreshold: data.captchaThreshold ?? existing.captchaThreshold
        }
      })
    }

    return this.prisma.votingConfig.create({
      data: {
        authMode: data.authMode ?? 'OTP',
        maxSeriesPerVote: data.maxSeriesPerVote ?? 1,
        otpExpirySeconds: data.otpExpirySeconds ?? 300,
        otpMaxAttempts: data.otpMaxAttempts ?? 3,
        ipRateLimit: data.ipRateLimit ?? 10,
        phoneRateLimit: data.phoneRateLimit ?? 5,
        captchaThreshold: data.captchaThreshold ?? 0.5
      }
    })
  }
}
