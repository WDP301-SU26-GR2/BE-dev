import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { JOB, QUEUE } from 'src/infrastructure/queue/queue.constant'
import { StorageService } from 'src/infrastructure/storage/storage.service'
import { AiRepository } from '../ai.repo'
import { AiMessages } from '../ai.messages'
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
    let sourceFileKey = aiJob.sourceFileKey
    if (!sourceFileKey) {
      // Jobs queued before the source-snapshot migration are allowed one compatibility
      // fallback. New jobs always persist an immutable sourceFileKey.
      this.logger.warn(`AiJob ${aiJobId} has no source snapshot; using legacy originalFile fallback`)
      sourceFileKey = (await this.aiRepository.findPageFile(aiJob.pageId))?.originalFile ?? null
    }
    if (!sourceFileKey) {
      await this.aiJobStateService.transition(aiJobId, ['QUEUED', 'RUNNING'], 'FAILED', {
        error: AiMessages.error.pageHasNoFile,
        finishedAt: new Date()
      })
      return
    }

    try {
      await this.aiJobStateService.transition(aiJobId, ['QUEUED', 'RUNNING'], 'RUNNING', {
        startedAt: aiJob.startedAt ?? new Date()
      })
      const { downloadUrl } = await this.storageService.createPresignedDownload(sourceFileKey)
      const started = Date.now()
      const result = await this.aiClient.segment({ imageUrl: downloadUrl, mode: aiJob.mode ?? 'MODEL' })
      const proposedRegions = result.regions.map((r) => ({
        regionType: r.type,
        detectedSubtype: r.subtype ?? null,
        coordinates: r.bbox,
        confidenceScore: r.confidence
      }))
      let page = await this.aiRepository.findPageCanvas(aiJob.pageId)
      if (!page) {
        await this.aiJobStateService.transition(aiJobId, ['RUNNING'], 'FAILED', {
          error: AiMessages.error.pageHasNoFile,
          finishedAt: new Date()
        })
        return
      }
      if (page.canvasWidth == null || page.canvasHeight == null) {
        await this.aiRepository.setCanvasIfUnset(aiJob.pageId, result.imageWidth, result.imageHeight)
        page = await this.aiRepository.findPageCanvas(aiJob.pageId)
      }
      if (page?.canvasWidth !== result.imageWidth || page.canvasHeight !== result.imageHeight) {
        await this.aiJobStateService.transition(aiJobId, ['RUNNING'], 'FAILED', {
          error: AiMessages.error.aiSourceCanvasMismatch,
          finishedAt: new Date()
        })
        return
      }
      await this.aiJobStateService.transition(aiJobId, ['RUNNING'], 'SUCCEEDED', {
        proposedRegions,
        modelVersion: result.modelVersion,
        regionCount: proposedRegions.length,
        sourceWidth: result.imageWidth,
        sourceHeight: result.imageHeight,
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
