import { Injectable } from '@nestjs/common'
import { RateLimitService } from 'src/core/security/services/rate-limit.service'
import { RecaptchaService } from 'src/infrastructure/captcha/recaptcha.service'
import { VoteOtpRequestBodyDto } from '../dto/survey.dto'
import { CaptchaRejectedException, VoteOtpRateLimitException } from '../errors/survey.errors'
import { SurveyMessages } from '../survey.messages'
import { SurveyConfigService } from './survey-config.service'
import { SurveyOtpService } from './survey-otp.service'

@Injectable()
export class SurveyOtpRequestService {
  constructor(
    private readonly surveyConfigService: SurveyConfigService,
    private readonly rateLimitService: RateLimitService,
    private readonly surveyOtpService: SurveyOtpService,
    private readonly recaptchaService: RecaptchaService
  ) {}

  async requestOtp(body: VoteOtpRequestBodyDto, ip: string) {
    // B-VOT-06: rate-limit quota đọc từ VotingConfig DB (admin có thể giảm/tăng qua PATCH).
    const config = await this.surveyConfigService.get()

    // 1. Kiểm tra Rate Limit theo identity email
    const identityLimit = await this.rateLimitService.checkAndConsume({
      key: `survey:otp:identity:v2:${this.surveyOtpService.hashIdentity(body.identity)}`,
      max: config.phoneRateLimit,
      windowSec: 86400,
      cooldownSec: config.otpCooldownSeconds
    })
    if (!identityLimit.allowed) {
      throw VoteOtpRateLimitException(identityLimit.retryAfter)
    }

    // 2. Kiểm tra Rate Limit theo IP gán cho Guest
    const ipLimit = await this.rateLimitService.checkAndConsume({
      key: `survey:otp:ip:v2:${this.surveyOtpService.hashIp(ip)}`,
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

    await this.surveyOtpService.issueEmailOtp({
      identity: body.identity,
      ip,
      expirySeconds: config.otpExpirySeconds,
      maxAttempts: config.otpMaxAttempts
    })

    return { message: SurveyMessages.response.otpSent }
  }
}
