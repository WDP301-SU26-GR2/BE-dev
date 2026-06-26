import envConfig from 'src/core/config/envConfig'

export type RateLimitDecision = { allowed: true } | { allowed: false; reason: 'COOLDOWN' | 'QUOTA'; retryAfter: number }

export interface RateLimitRule {
  key: string
  max: number
  windowSec: number
  cooldownSec?: number
}

export const otpEmailRule = (email: string): RateLimitRule => ({
  key: `email:${email.trim().toLowerCase()}`,
  max: envConfig.OTP_RL_EMAIL_MAX,
  windowSec: envConfig.OTP_RL_EMAIL_WINDOW,
  cooldownSec: envConfig.OTP_RL_COOLDOWN
})

export const otpIpRule = (ip: string): RateLimitRule => ({
  key: `ip:${ip}`,
  max: envConfig.OTP_RL_IP_MAX,
  windowSec: envConfig.OTP_RL_IP_WINDOW
})
