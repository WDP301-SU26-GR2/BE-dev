import { Injectable } from '@nestjs/common'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RegionType } from '@prisma/client'
import envConfig from 'src/core/config/envConfig'
import { AI_JOB_OPTIONS, JOB, QUEUE } from 'src/infrastructure/queue/queue.constant'
import { QueueService } from 'src/infrastructure/queue/queue.service'
import { STAGE_REGION_HINTS } from 'src/modules/chapter/production-stage.constant'
import {
  StageLockedException,
  StageNotFoundException,
  StagePageNotFoundException,
  StageRequiredException
} from 'src/modules/chapter/errors/production-stage.errors'
import { RegionService } from 'src/modules/task/services/region.service'
import { AiMessages } from '../ai.messages'
import { toAiJobListItem, toAiJobRes } from '../ai.mapper'
import { AiRepository } from '../ai.repo'
import {
  AiEnqueueFailedException,
  AiJobNotApplicableException,
  AiJobNotFoundException,
  AiJobSourceStaleException,
  AiNotEnabledException,
  AiSourceCanvasMismatchException,
  PageHasNoFileException,
  SegmentJobAlreadyRunningException
} from '../errors/ai.errors'
import { ListAiJobsQueryType, ProposedRegionType, SegmentPageBodyType } from '../schemas/ai-schemas'
import { AiJobStateService } from './ai-job-state.service'
import { ProductionStageQueryPort } from '../ports/production-stage-query.port'

export interface SegmentPageJob {
  aiJobId: string
}

@Injectable()
export class AiSegmentService {
  constructor(
    private readonly aiRepository: AiRepository,
    private readonly regionService: RegionService,
    private readonly queueService: QueueService,
    private readonly aiJobStateService: AiJobStateService,
    private readonly productionStageQuery: ProductionStageQueryPort
  ) {}

  private isEnabled(): boolean {
    return envConfig.NODE_ENV !== 'test' && envConfig.AI_SERVICE_URL !== ''
  }

  private async resolveSource(
    page: { id: string; chapterId: string; originalFile: string | null },
    stageId: string | undefined
  ) {
    const stageCount = await this.productionStageQuery.countByChapter(page.chapterId)
    if (stageCount === 0) {
      if (!page.originalFile) throw PageHasNoFileException
      return {
        sourceType: 'ORIGINAL' as const,
        sourceFileKey: page.originalFile,
        sourceRevision: 1,
        sourceStageId: undefined
      }
    }

    if (!stageId) throw StageRequiredException
    const stage = await this.productionStageQuery.findById(stageId)
    if (!stage || stage.chapterId !== page.chapterId) throw StageNotFoundException
    if (stage.status !== 'ACTIVE') throw StageLockedException
    const stagePage = await this.productionStageQuery.findStagePage(stage.id, page.id)
    if (!stagePage) throw StagePageNotFoundException
    return {
      sourceType: stagePage.inputSourceType,
      sourceFileKey: stagePage.inputFileKey,
      sourceRevision: stagePage.inputRevision,
      sourceStageId: stage.id
    }
  }

  private async suggestedTypes(sourceStageId: string | null): Promise<readonly RegionType[] | undefined> {
    if (!sourceStageId) return undefined
    const stage = await this.productionStageQuery.findById(sourceStageId)
    if (!stage || stage.isFinalCheck) return undefined
    return STAGE_REGION_HINTS[stage.name]
  }

  async requestSegment(mangakaId: string, pageId: string, body: SegmentPageBodyType) {
    const page = await this.regionService.assertPageOwner(mangakaId, pageId)
    const source = await this.resolveSource(page, body.stageId)
    if (!this.isEnabled()) throw AiNotEnabledException
    if (await this.aiRepository.findOpenSegmentJob(pageId, source)) throw SegmentJobAlreadyRunningException

    const job = await this.aiRepository.createJob({
      type: 'SEGMENT',
      mode: body.mode,
      pageId,
      requestedBy: mangakaId,
      ...source
    })
    try {
      await this.queueService.enqueue<SegmentPageJob>(QUEUE.AI, JOB.SEGMENT_PAGE, { aiJobId: job.id }, AI_JOB_OPTIONS)
    } catch (err) {
      await this.aiJobStateService.transition(job.id, ['QUEUED'], 'FAILED', {
        error: `enqueue failed: ${err instanceof Error ? err.message : String(err)}`,
        finishedAt: new Date()
      })
      throw AiEnqueueFailedException
    }
    return { jobId: job.id, status: job.status }
  }

  private async requireOwnJob(userId: string, jobId: string) {
    if (!isObjectId(jobId)) throw AiJobNotFoundException
    const job = await this.aiRepository.findJobById(jobId)
    if (!job || job.requestedBy !== userId) throw AiJobNotFoundException
    return job
  }

  async getJob(userId: string, jobId: string) {
    const job = await this.requireOwnJob(userId, jobId)
    return toAiJobRes(job, await this.suggestedTypes(job.sourceStageId ?? null))
  }

  async listJobs(mangakaId: string, pageId: string, query: ListAiJobsQueryType) {
    await this.regionService.assertPageOwner(mangakaId, pageId, { checkHold: false, checkEditable: false })
    const jobs = await this.aiRepository.listJobsByPage(pageId, query.type)
    return { items: jobs.map(toAiJobListItem) }
  }

  private async assertSourceCurrent(job: Awaited<ReturnType<AiRepository['findJobById']>>) {
    if (!job?.sourceFileKey || job.sourceRevision == null) throw AiJobSourceStaleException
    const page = await this.aiRepository.findPageCanvas(job.pageId)
    if (!page) throw AiJobSourceStaleException

    if (job.sourceStageId) {
      const stage = await this.productionStageQuery.findById(job.sourceStageId)
      if (!stage || stage.status !== 'ACTIVE') throw AiJobSourceStaleException
      const stagePage = await this.productionStageQuery.findStagePage(stage.id, job.pageId)
      if (
        !stagePage ||
        stagePage.inputSourceType !== job.sourceType ||
        stagePage.inputFileKey !== job.sourceFileKey ||
        stagePage.inputRevision !== job.sourceRevision
      ) {
        throw AiJobSourceStaleException
      }
    } else if (job.sourceType !== 'ORIGINAL' || job.sourceRevision !== 1 || page.originalFile !== job.sourceFileKey) {
      throw AiJobSourceStaleException
    }

    if (
      job.sourceWidth == null ||
      job.sourceHeight == null ||
      page.canvasWidth !== job.sourceWidth ||
      page.canvasHeight !== job.sourceHeight
    ) {
      throw AiSourceCanvasMismatchException
    }
  }

  async applyJob(userId: string, jobId: string) {
    const job = await this.requireOwnJob(userId, jobId)
    await this.regionService.assertPageOwner(userId, job.pageId)
    const regions = job.proposedRegions as unknown as ProposedRegionType[] | null
    if (job.status !== 'SUCCEEDED' || !regions) throw AiJobNotApplicableException
    await this.assertSourceCurrent(job)
    const result = await this.regionService.applyAiRegions(job.pageId, regions, { aiModelVersion: job.modelVersion })
    await this.aiRepository.markApplied(jobId)
    return { message: AiMessages.response.applied, ...result }
  }
}
