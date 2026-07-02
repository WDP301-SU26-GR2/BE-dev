import { Injectable } from '@nestjs/common'
import { ListAiJobsQueryType, SegmentPageBodyType } from './schemas/ai-schemas'
import { AiSegmentService } from './services/ai-segment.service'

@Injectable()
export class AiService {
  constructor(private readonly aiSegmentService: AiSegmentService) {}

  requestSegment(userId: string, pageId: string, body: SegmentPageBodyType) {
    return this.aiSegmentService.requestSegment(userId, pageId, body)
  }

  getJob(userId: string, jobId: string) {
    return this.aiSegmentService.getJob(userId, jobId)
  }

  listJobs(userId: string, pageId: string, query: ListAiJobsQueryType) {
    return this.aiSegmentService.listJobs(userId, pageId, query)
  }

  applyJob(userId: string, jobId: string) {
    return this.aiSegmentService.applyJob(userId, jobId)
  }
}
