import { Injectable, Logger } from '@nestjs/common'
import envConfig from 'src/core/config/envConfig'

export interface CaptchaVerifyResult {
  ok: boolean
  /** Score 0..1 from reCAPTCHA v3; null when verification has no score. */
  score: number | null
  /** Google was unavailable, so verification failed open for later review. */
  degraded: boolean
}

const SITEVERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'
const VERIFY_TIMEOUT_MS = 3000

@Injectable()
export class RecaptchaService {
  private readonly logger = new Logger(RecaptchaService.name)

  async verify(token: string, remoteIp?: string): Promise<CaptchaVerifyResult> {
    if (!envConfig.RECAPTCHA_SECRET) return { ok: true, score: null, degraded: false }

    const params = new URLSearchParams({ secret: envConfig.RECAPTCHA_SECRET, response: token })
    if (remoteIp) params.set('remoteip', remoteIp)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS)

    try {
      const response = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: controller.signal
      })

      if (!response.ok) throw new Error(`siteverify HTTP ${response.status}`)

      const data = (await response.json()) as { success: boolean; score?: number }
      if (!data.success) return { ok: false, score: null, degraded: false }

      return {
        ok: true,
        score: typeof data.score === 'number' ? data.score : null,
        degraded: false
      }
    } catch (error) {
      this.logger.warn(`reCAPTCHA siteverify failed — fail-open (degraded): ${String(error)}`)
      return { ok: true, score: null, degraded: true }
    } finally {
      clearTimeout(timer)
    }
  }
}
