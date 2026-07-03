import { Injectable, Logger } from '@nestjs/common'
import { AiJobStatus, Prisma } from '@prisma/client'
import { AiRepository } from '../ai.repo'

const AI_JOB_TRANSITIONS: Record<AiJobStatus, AiJobStatus[]> = {
  QUEUED: ['RUNNING', 'FAILED'],
  RUNNING: ['RUNNING', 'SUCCEEDED', 'FAILED'],
  SUCCEEDED: [],
  FAILED: []
}

@Injectable()
export class AiJobStateService {
  private readonly logger = new Logger(AiJobStateService.name)

  constructor(private readonly aiRepository: AiRepository) {}

  async transition(
    id: string,
    from: AiJobStatus[],
    to: AiJobStatus,
    extra: Prisma.AiJobUpdateManyMutationInput = {}
  ): Promise<boolean> {
    const invalid = from.filter((f) => !AI_JOB_TRANSITIONS[f].includes(to))
    if (invalid.length > 0) {
      this.logger.warn(`Invalid AiJob transition ${invalid.join(',')} -> ${to} (job ${id}) - skipped`)
      return false
    }
    const count = await this.aiRepository.transitionStatus(id, from, to, extra)
    if (count === 0) this.logger.warn(`AiJob transition -> ${to} matched 0 rows (job ${id})`)
    return count > 0
  }
}
