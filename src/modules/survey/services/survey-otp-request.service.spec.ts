import { CaptchaRejectedException } from '../errors/survey.errors'
import { SurveyMessages } from '../survey.messages'
import { SurveyOtpRequestService } from './survey-otp-request.service'

describe('SurveyOtpRequestService', () => {
  function setup() {
    const config = {
      phoneRateLimit: 3,
      ipRateLimit: 8,
      otpCooldownSeconds: 60,
      captchaThreshold: 0.7,
      otpExpirySeconds: 300,
      otpMaxAttempts: 3
    }
    const surveyConfigService = { get: jest.fn().mockResolvedValue(config) }
    const rateLimitService = {
      checkAndConsume: jest.fn().mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: true })
    }
    const surveyOtpService = {
      hashIdentity: jest.fn().mockReturnValue('identity-hash'),
      hashIp: jest.fn().mockReturnValue('ip-hash'),
      issueEmailOtp: jest.fn().mockResolvedValue(undefined)
    }
    const recaptchaService = { verify: jest.fn().mockResolvedValue({ ok: true, score: 0.9 }) }
    const service = new SurveyOtpRequestService(
      surveyConfigService as never,
      rateLimitService as never,
      surveyOtpService as never,
      recaptchaService as never
    )
    return { service, config, rateLimitService, surveyOtpService, recaptchaService }
  }

  const body = { identity: 'reader@example.com', captchaToken: 'captcha-token' }

  it('rate-limits using hashes and persists no raw identity in limiter keys', async () => {
    const { service, config, rateLimitService, surveyOtpService } = setup()

    await expect(service.requestOtp(body as never, '203.0.113.7')).resolves.toEqual({
      message: SurveyMessages.response.otpSent
    })

    expect(rateLimitService.checkAndConsume).toHaveBeenNthCalledWith(1, {
      key: 'survey:otp:identity:v2:identity-hash',
      max: config.phoneRateLimit,
      windowSec: 86400,
      cooldownSec: config.otpCooldownSeconds
    })
    expect(rateLimitService.checkAndConsume).toHaveBeenNthCalledWith(2, {
      key: 'survey:otp:ip:v2:ip-hash',
      max: config.ipRateLimit,
      windowSec: 86400
    })
    expect(JSON.stringify(rateLimitService.checkAndConsume.mock.calls)).not.toContain(body.identity)
    expect(JSON.stringify(rateLimitService.checkAndConsume.mock.calls)).not.toContain('203.0.113.7')
    expect(surveyOtpService.issueEmailOtp).toHaveBeenCalledWith({
      identity: body.identity,
      ip: '203.0.113.7',
      expirySeconds: config.otpExpirySeconds,
      maxAttempts: config.otpMaxAttempts
    })
  })

  it('stops before IP/captcha/delivery when the identity quota is exhausted', async () => {
    const { service, rateLimitService, recaptchaService, surveyOtpService } = setup()
    rateLimitService.checkAndConsume.mockReset().mockResolvedValueOnce({ allowed: false, retryAfter: 42 })

    await expect(service.requestOtp(body as never, '203.0.113.7')).rejects.toMatchObject({
      response: expect.objectContaining({ retryAfter: 42 })
    })

    expect(rateLimitService.checkAndConsume).toHaveBeenCalledTimes(1)
    expect(recaptchaService.verify).not.toHaveBeenCalled()
    expect(surveyOtpService.issueEmailOtp).not.toHaveBeenCalled()
  })

  it('stops before captcha/delivery when the IP quota is exhausted', async () => {
    const { service, rateLimitService, recaptchaService, surveyOtpService } = setup()
    rateLimitService.checkAndConsume
      .mockReset()
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfter: 21 })

    await expect(service.requestOtp(body as never, '203.0.113.7')).rejects.toMatchObject({
      response: expect.objectContaining({ retryAfter: 21 })
    })

    expect(recaptchaService.verify).not.toHaveBeenCalled()
    expect(surveyOtpService.issueEmailOtp).not.toHaveBeenCalled()
  })

  it.each([
    ['provider rejection', { ok: false, score: null }],
    ['low score', { ok: true, score: 0.69 }]
  ])('rejects captcha for %s', async (_label, captchaResult) => {
    const { service, recaptchaService, surveyOtpService } = setup()
    recaptchaService.verify.mockResolvedValueOnce(captchaResult)

    await expect(service.requestOtp(body as never, '203.0.113.7')).rejects.toBe(CaptchaRejectedException)
    expect(surveyOtpService.issueEmailOtp).not.toHaveBeenCalled()
  })

  it('accepts the documented degraded captcha score=null path', async () => {
    const { service, recaptchaService, surveyOtpService } = setup()
    recaptchaService.verify.mockResolvedValueOnce({ ok: true, score: null })

    await service.requestOtp(body, '203.0.113.7')

    expect(surveyOtpService.issueEmailOtp).toHaveBeenCalledTimes(1)
  })
})
