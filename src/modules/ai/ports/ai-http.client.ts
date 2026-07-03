import { Injectable } from '@nestjs/common'
import envConfig from 'src/core/config/envConfig'
import { AiSegmentResponseSchema, AiSegmentResponseType } from '../schemas/ai-schemas'
import { AiClientPort, AiSegmentInput } from './ai-client.port'

@Injectable()
export class AiHttpClient extends AiClientPort {
  async segment(input: AiSegmentInput): Promise<AiSegmentResponseType> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), envConfig.AI_HTTP_TIMEOUT_MS)
    try {
      const response = await fetch(`${envConfig.AI_SERVICE_URL}/v1/segment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': envConfig.AI_SERVICE_API_KEY },
        body: JSON.stringify({ imageUrl: input.imageUrl, mode: input.mode }),
        signal: controller.signal
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(`ai-service ${response.status}: ${body.error ?? 'unknown error'}`)
      }
      return AiSegmentResponseSchema.parse(await response.json())
    } finally {
      clearTimeout(timer)
    }
  }
}
