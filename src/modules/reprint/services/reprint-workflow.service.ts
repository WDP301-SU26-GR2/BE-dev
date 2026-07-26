import { Injectable } from '@nestjs/common'
import {
  BoardApproveReprintBodyDto,
  CreateReprintRequestBodyDto,
  MangakaReviewReprintBodyDto
} from '../dto/reprint-request.dto'
import { AssignReviserBodyType } from '../schemas/reprint-request-schema'
import { ActorContext } from './reprint-access.policy'
import { ReprintAssignmentService } from './reprint-assignment.service'
import { ReprintCreationService } from './reprint-creation.service'
import { ReprintReviewService } from './reprint-review.service'

@Injectable()
export class ReprintWorkflowService {
  constructor(
    private readonly creationService: ReprintCreationService,
    private readonly reviewService: ReprintReviewService,
    private readonly assignmentService: ReprintAssignmentService
  ) {}

  create(actor: ActorContext | string, dto: CreateReprintRequestBodyDto) {
    return this.creationService.create(actor, dto)
  }

  mangakaReview(id: string, dto: MangakaReviewReprintBodyDto, actor: ActorContext | string) {
    return this.reviewService.mangakaReview(id, dto, actor)
  }

  boardApprove(id: string, dto: BoardApproveReprintBodyDto, actor: ActorContext | string) {
    return this.reviewService.boardApprove(id, dto, actor)
  }

  assignReviser(id: string, chapterId: string, dto: AssignReviserBodyType, actor: ActorContext | string) {
    return this.assignmentService.assignReviser(id, chapterId, dto, actor)
  }
}
