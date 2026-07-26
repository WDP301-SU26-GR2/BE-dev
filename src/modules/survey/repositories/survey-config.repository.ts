import { PrismaService } from 'src/infrastructure/database/prisma.service'

export type VotingConfigData = {
  authMode?: 'OTP' | 'CAPTCHA' | 'HYBRID'
  maxSeriesPerVote?: number
  otpExpirySeconds?: number
  otpMaxAttempts?: number
  ipRateLimit?: number
  phoneRateLimit?: number
  otpCooldownSeconds?: number
  ipVotesPerPeriod?: number
  captchaThreshold?: number
}

const VOTING_CONFIG_DEFAULTS = {
  authMode: 'OTP',
  maxSeriesPerVote: 3,
  otpExpirySeconds: 300,
  otpMaxAttempts: 3,
  ipRateLimit: 10,
  phoneRateLimit: 3,
  otpCooldownSeconds: 60,
  ipVotesPerPeriod: 10,
  captchaThreshold: 0.3
} as const

export class SurveyConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  get() {
    return this.prisma.votingConfig.findFirst()
  }

  createDefault() {
    return this.prisma.votingConfig.create({ data: VOTING_CONFIG_DEFAULTS })
  }

  async update(data: VotingConfigData) {
    const existing = await this.prisma.votingConfig.findFirst()
    if (!existing) {
      return this.prisma.votingConfig.create({
        data: {
          authMode: data.authMode ?? VOTING_CONFIG_DEFAULTS.authMode,
          maxSeriesPerVote: data.maxSeriesPerVote ?? VOTING_CONFIG_DEFAULTS.maxSeriesPerVote,
          otpExpirySeconds: data.otpExpirySeconds ?? VOTING_CONFIG_DEFAULTS.otpExpirySeconds,
          otpMaxAttempts: data.otpMaxAttempts ?? VOTING_CONFIG_DEFAULTS.otpMaxAttempts,
          ipRateLimit: data.ipRateLimit ?? VOTING_CONFIG_DEFAULTS.ipRateLimit,
          phoneRateLimit: data.phoneRateLimit ?? VOTING_CONFIG_DEFAULTS.phoneRateLimit,
          otpCooldownSeconds: data.otpCooldownSeconds ?? VOTING_CONFIG_DEFAULTS.otpCooldownSeconds,
          ipVotesPerPeriod: data.ipVotesPerPeriod ?? VOTING_CONFIG_DEFAULTS.ipVotesPerPeriod,
          captchaThreshold: data.captchaThreshold ?? VOTING_CONFIG_DEFAULTS.captchaThreshold
        }
      })
    }

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
}
