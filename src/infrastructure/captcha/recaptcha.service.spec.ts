import { RecaptchaService } from './recaptcha.service'
import envConfig from 'src/core/config/envConfig'

jest.mock('src/core/config/envConfig', () => ({
  __esModule: true,
  default: { RECAPTCHA_SECRET: 'test-secret' }
}))

describe('RecaptchaService', () => {
  let service: RecaptchaService
  const fetchMock = jest.fn()
  const originalFetch = global.fetch

  beforeEach(() => {
    service = new RecaptchaService()
    global.fetch = fetchMock as never
    fetchMock.mockReset()
  })

  afterEach(() => {
    envConfig.RECAPTCHA_SECRET = 'test-secret'
    jest.useRealTimers()
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('skips verification in dev mode when the secret is empty', async () => {
    envConfig.RECAPTCHA_SECRET = ''

    await expect(service.verify('any-token')).resolves.toEqual({ ok: true, score: null, degraded: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns the score and sends the optional remote IP when Google accepts the token', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, score: 0.9 }) })

    await expect(service.verify('tok', '1.2.3.4')).resolves.toEqual({ ok: true, score: 0.9, degraded: false })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.google.com/recaptcha/api/siteverify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'secret=test-secret&response=tok&remoteip=1.2.3.4',
        signal: expect.any(AbortSignal)
      })
    )
  })

  it('returns ok=false when Google rejects the token', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: false }) })

    await expect(service.verify('bad')).resolves.toEqual({ ok: false, score: null, degraded: false })
  })

  it('accepts a successful reCAPTCHA v2 response without a score', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) })

    await expect(service.verify('tok')).resolves.toEqual({ ok: true, score: null, degraded: false })
  })

  it('fails open in degraded mode on network or timeout errors', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT'))

    await expect(service.verify('tok')).resolves.toEqual({ ok: true, score: null, degraded: true })
  })

  it('aborts siteverify after three seconds and fails open in degraded mode', async () => {
    jest.useFakeTimers()
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })

    const verification = service.verify('tok')
    await jest.advanceTimersByTimeAsync(3000)

    await expect(verification).resolves.toEqual({ ok: true, score: null, degraded: true })
  })

  it('fails open in degraded mode when Google responds with HTTP 500', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })

    await expect(service.verify('tok')).resolves.toEqual({ ok: true, score: null, degraded: true })
  })
})
