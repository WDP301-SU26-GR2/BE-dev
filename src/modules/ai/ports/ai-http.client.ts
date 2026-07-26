import { Injectable } from '@nestjs/common'
import envConfig from 'src/core/config/envConfig'
import { AiSegmentResponseSchema, AiSegmentResponseType } from '../schemas/ai-schemas'
import { AiClientPort, AiSegmentInput } from './ai-client.port'
import { RequestContextService } from 'src/core/observability/request-context.service'
import { RuntimeMetricsService } from 'src/core/observability/runtime-metrics.service'

@Injectable()
export class AiHttpClient extends AiClientPort {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly metrics: RuntimeMetricsService
  ) {
    super()
  }

  async segment(input: AiSegmentInput): Promise<AiSegmentResponseType> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), envConfig.AI_HTTP_TIMEOUT_MS)
    const startedAt = process.hrtime.bigint()
    let outcome: 'success' | 'failure' = 'failure'
    try {
      const response = await fetch(`${envConfig.AI_SERVICE_URL}/v1/segment`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': envConfig.AI_SERVICE_API_KEY,
          ...(this.requestContext.getRequestId() ? { 'x-request-id': this.requestContext.getRequestId() } : {})
        },
        body: JSON.stringify({ imageUrl: input.imageUrl, mode: input.mode }),
        signal: controller.signal
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(`ai-service ${response.status}: ${body.error ?? 'unknown error'}`)
      }
      const result = AiSegmentResponseSchema.parse(await response.json())
      outcome = 'success'
      return result
    } finally {
      clearTimeout(timer)
      this.metrics.recordAiInference({
        operation: 'segment',
        outcome,
        durationSeconds: Number(process.hrtime.bigint() - startedAt) / 1_000_000_000
      })
    }
  }
}
