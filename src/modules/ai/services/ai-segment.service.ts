import { Injectable } from '@nestjs/common'
import envConfig from 'src/core/config/envConfig'
import { AI_JOB_OPTIONS, JOB, QUEUE } from 'src/infrastructure/queue/queue.constant'
import { QueueService } from 'src/infrastructure/queue/queue.service'
import { RegionService } from 'src/modules/task/services/region.service'
import { OBJECT_ID_RE } from '../ai.constant'
import { AiMessages } from '../ai.messages'
import { toAiJobListItem, toAiJobRes } from '../ai.mapper'
import { AiRepository } from '../ai.repo'
import {
  AiEnqueueFailedException,
  AiJobNotApplicableException,
  AiJobNotFoundException,
  AiNotEnabledException,
  PageHasNoFileException,
  SegmentJobAlreadyRunningException
} from '../errors/ai.errors'
import { ListAiJobsQueryType, ProposedRegionType, SegmentPageBodyType } from '../schemas/ai-schemas'
import { AiJobStateService } from './ai-job-state.service'

export interface SegmentPageJob {
  aiJobId: string
}

@Injectable()
export class AiSegmentService {
  constructor(
    private readonly aiRepository: AiRepository,
    private readonly regionService: RegionService,
    private readonly queueService: QueueService,
    private readonly aiJobStateService: AiJobStateService
  ) {}

  private isEnabled(): boolean {
    return envConfig.AI_SERVICE_URL !== ''
  }

  async requestSegment(mangakaId: string, pageId: string, body: SegmentPageBodyType) {
    const page = await this.regionService.assertPageOwner(mangakaId, pageId)
    if (!page.originalFile) throw PageHasNoFileException
    if (!this.isEnabled()) throw AiNotEnabledException
    if (await this.aiRepository.findOpenSegmentJob(pageId)) throw SegmentJobAlreadyRunningException

    const job = await this.aiRepository.createJob({ type: 'SEGMENT', mode: body.mode, pageId, requestedBy: mangakaId })
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
    if (!OBJECT_ID_RE.test(jobId)) throw AiJobNotFoundException
    const job = await this.aiRepository.findJobById(jobId)
    if (!job || job.requestedBy !== userId) throw AiJobNotFoundException
    return job
  }

  async getJob(userId: string, jobId: string) {
    return toAiJobRes(await this.requireOwnJob(userId, jobId))
  }

  async listJobs(mangakaId: string, pageId: string, query: ListAiJobsQueryType) {
    await this.regionService.assertPageOwner(mangakaId, pageId)
    const jobs = await this.aiRepository.listJobsByPage(pageId, query.type)
    return { items: jobs.map(toAiJobListItem) }
  }

  async applyJob(userId: string, jobId: string) {
    const job = await this.requireOwnJob(userId, jobId)
    await this.regionService.assertPageOwner(userId, job.pageId)
    const regions = job.proposedRegions as unknown as ProposedRegionType[] | null
    if (job.status !== 'SUCCEEDED' || !regions) throw AiJobNotApplicableException
    const result = await this.regionService.applyAiRegions(job.pageId, regions, { aiModelVersion: job.modelVersion })
    await this.aiRepository.markApplied(jobId)
    return { message: AiMessages.response.applied, ...result }
  }
}
