import { SurveyConfigService } from './survey-config.service'

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    getVotingConfig: jest.fn(),
    createDefaultVotingConfig: jest.fn(),
    ...overrides
  }
}

describe('SurveyConfigService (B-VOT-06)', () => {
  it('lazy-seeds Requiment §1.15 defaults when no row exists', async () => {
    const repo = makeRepo()
    repo.getVotingConfig.mockResolvedValue(null)
    repo.createDefaultVotingConfig.mockResolvedValue({
      id: 'c1',
      authMode: 'OTP',
      maxSeriesPerVote: 3,
      phoneRateLimit: 3,
      ipRateLimit: 10,
      captchaThreshold: 0.3,
      otpExpirySeconds: 300
    })

    const svc = new SurveyConfigService(repo as never)
    const cfg = await svc.get()

    expect(repo.createDefaultVotingConfig).toHaveBeenCalledTimes(1)
    expect(cfg.maxSeriesPerVote).toBe(3)
    expect(cfg.captchaThreshold).toBe(0.3)
    expect(cfg.phoneRateLimit).toBe(3)
  })

  it('caches within TTL: second get() does not hit the repo again', async () => {
    const repo = makeRepo()
    repo.getVotingConfig.mockResolvedValue({
      id: 'c1',
      authMode: 'OTP',
      maxSeriesPerVote: 3,
      phoneRateLimit: 3,
      ipRateLimit: 10,
      captchaThreshold: 0.3,
      otpExpirySeconds: 300
    })
    const svc = new SurveyConfigService(repo as never)

    await svc.get()
    await svc.get()

    expect(repo.getVotingConfig).toHaveBeenCalledTimes(1)
  })

  it('invalidate() forces a fresh read', async () => {
    const repo = makeRepo()
    repo.getVotingConfig.mockResolvedValue({
      id: 'c1',
      authMode: 'OTP',
      maxSeriesPerVote: 3,
      phoneRateLimit: 3,
      ipRateLimit: 10,
      captchaThreshold: 0.3,
      otpExpirySeconds: 300
    })
    const svc = new SurveyConfigService(repo as never)

    await svc.get()
    svc.invalidate()
    await svc.get()

    expect(repo.getVotingConfig).toHaveBeenCalledTimes(2)
  })
})
