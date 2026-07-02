import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { JOB, QUEUE } from 'src/infrastructure/queue/queue.constant'
import { StorageService } from 'src/infrastructure/storage/storage.service'
import { AiRepository } from '../ai.repo'
import { AiClientPort } from '../ports/ai-client.port'
import { AiJobStateService } from './ai-job-state.service'
import type { SegmentPageJob } from './ai-segment.service'

@Processor(QUEUE.AI, { concurrency: 1 })
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name)

  constructor(
    private readonly aiRepository: AiRepository,
    private readonly aiJobStateService: AiJobStateService,
    private readonly storageService: StorageService,
    private readonly aiClient: AiClientPort
  ) {
    super()
  }

  async process(job: Job): Promise<void> {
    if (job.name !== JOB.SEGMENT_PAGE) {
      this.logger.warn(`Unknown ai job: ${job.name}`)
      return
    }

    const { aiJobId } = job.data as SegmentPageJob
    const aiJob = await this.aiRepository.findJobById(aiJobId)
    if (!aiJob) {
      this.logger.warn(`AiJob ${aiJobId} not found - skipping`)
      return
    }

    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
    const page = await this.aiRepository.findPageFile(aiJob.pageId)
    if (!page?.originalFile) {
      await this.aiJobStateService.transition(aiJobId, ['QUEUED', 'RUNNING'], 'FAILED', {
        error: 'page has no original file',
        finishedAt: new Date()
      })
      return
    }

    try {
      await this.aiJobStateService.transition(aiJobId, ['QUEUED', 'RUNNING'], 'RUNNING', {
        startedAt: aiJob.startedAt ?? new Date()
      })
      const { downloadUrl } = await this.storageService.createPresignedDownload(page.originalFile)
      const started = Date.now()
      const result = await this.aiClient.segment({ imageUrl: downloadUrl, mode: aiJob.mode ?? 'MODEL' })
      const proposedRegions = result.regions.map((r) => ({
        regionType: r.type,
        detectedSubtype: r.subtype ?? null,
        coordinates: r.bbox,
        confidenceScore: r.confidence
      }))
      await this.aiJobStateService.transition(aiJobId, ['RUNNING'], 'SUCCEEDED', {
        proposedRegions,
        modelVersion: result.modelVersion,
        regionCount: proposedRegions.length,
        finishedAt: new Date(),
        durationMs: Date.now() - started
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!isLastAttempt) throw err
      this.logger.error(`AiJob ${aiJobId} failed after final attempt: ${message}`)
      await this.aiJobStateService.transition(aiJobId, ['RUNNING'], 'FAILED', {
        error: message,
        finishedAt: new Date()
      })
    }
  }
}
