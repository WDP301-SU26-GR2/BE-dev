import { Injectable } from '@nestjs/common'
import type { JwtAccessTokenPayload } from 'src/infrastructure/token/jwt.type'
import { ConfirmStageOutputsBodyDto, CreateStageBodyDto, UpdateStageBodyDto } from '../dto/production-stage.dto'
import { ProductionStagePageService } from './production-stage-page.service'
import { ProductionStageService } from './production-stage.service'

@Injectable()
export class ProductionStageFacade {
  constructor(
    private readonly stages: ProductionStageService,
    private readonly pages: ProductionStagePageService
  ) {}

  list(user: JwtAccessTokenPayload, chapterId: string) {
    return this.stages.list(user, chapterId)
  }

  complete(user: JwtAccessTokenPayload, chapterId: string, stageId: string) {
    return this.stages.complete(user, chapterId, stageId)
  }

  patch(user: JwtAccessTokenPayload, chapterId: string, stageId: string, body: UpdateStageBodyDto) {
    return this.stages.patch(user, chapterId, stageId, body)
  }

  add(user: JwtAccessTokenPayload, chapterId: string, body: CreateStageBodyDto) {
    return this.stages.add(user, chapterId, body)
  }

  remove(user: JwtAccessTokenPayload, chapterId: string, stageId: string) {
    return this.stages.remove(user, chapterId, stageId)
  }

  listPages(user: JwtAccessTokenPayload, chapterId: string, stageId: string) {
    return this.pages.listStagePages(user, chapterId, stageId)
  }

  confirmOutputs(user: JwtAccessTokenPayload, chapterId: string, stageId: string, body: ConfirmStageOutputsBodyDto) {
    return this.pages.confirmOutputs(user.userId, chapterId, stageId, body)
  }
}
