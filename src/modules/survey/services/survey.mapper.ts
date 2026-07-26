import { PublicationType } from '@prisma/client'

export function mapSurveyPeriod(surveyPeriod: {
  id: string
  magazine?: string | null
  publicationType?: PublicationType | null
  eligibleSeriesIds?: string[]
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
    magazine: surveyPeriod.magazine ?? null,
    publicationType: surveyPeriod.publicationType ?? null,
    eligibleSeriesIds: surveyPeriod.eligibleSeriesIds ?? [],
    issueNumber: surveyPeriod.issueNumber ?? undefined,
    reflectedIssueNumber: surveyPeriod.reflectedIssueNumber ?? undefined,
    startDate: surveyPeriod.startDate.toISOString(),
    endDate: surveyPeriod.endDate.toISOString(),
    status: surveyPeriod.status as 'DRAFT' | 'OPEN' | 'CLOSED' | 'REFLECTED'
  }
}

export function mapVotingConfig(config: {
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

export function mapRankingItem(r: {
  seriesId: string
  surveyPeriodId: string
  surveyPeriod?: {
    magazine: string | null
    publicationType: PublicationType | null
    issueNumber: number | null
  }
  magazine?: string | null
  publicationType?: PublicationType | null
  issueNumber?: number | null
  rankPosition: number | null
  voteCount: number
  normalizedScore?: number
  previousRank: number | null
  rankChange: number | null
  isAtRisk: boolean
  riskLevel: string
  isReliable: boolean
  recordedAt: Date
}) {
  return {
    seriesId: r.seriesId,
    surveyPeriodId: r.surveyPeriodId,
    magazine: r.surveyPeriod?.magazine ?? r.magazine ?? '',
    publicationType: (r.surveyPeriod?.publicationType ?? r.publicationType) as PublicationType,
    issueNumber: r.surveyPeriod?.issueNumber ?? r.issueNumber ?? null,
    rankPosition: r.rankPosition ?? undefined,
    voteCount: r.voteCount,
    normalizedScore: r.normalizedScore ?? 0,
    previousRank: r.previousRank,
    rankChange: r.rankChange,
    isAtRisk: r.isAtRisk,
    riskLevel: r.riskLevel as 'NONE' | 'LOW' | 'MEDIUM' | 'SEVERE',
    isReliable: r.isReliable,
    recordedAt: r.recordedAt.toISOString()
  }
}
