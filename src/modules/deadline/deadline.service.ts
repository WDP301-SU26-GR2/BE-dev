import { Injectable } from '@nestjs/common'
import {
  CounterDeadlineBodyType,
  CreateDeadlineRequestBodyType,
  DeadlineReasonBodyType,
  ListDeadlineRequestQueryType
} from './schemas/deadline-schemas'
import { DeadlineFinalizeService } from './services/deadline-finalize.service'
import { DeadlineNegotiationService } from './services/deadline-negotiation.service'
import { DeadlineQueryService } from './services/deadline-query.service'

@Injectable()
export class DeadlineService {
  constructor(
    private readonly negotiationService: DeadlineNegotiationService,
    private readonly finalizeService: DeadlineFinalizeService,
    private readonly queryService: DeadlineQueryService
  ) {}

  create(userId: string, body: CreateDeadlineRequestBodyType) {
    return this.negotiationService.create(userId, body)
  }

  counter(userId: string, id: string, body: CounterDeadlineBodyType) {
    return this.negotiationService.counter(userId, id, body)
  }

  agree(userId: string, id: string) {
    return this.negotiationService.agree(userId, id)
  }

  reject(userId: string, id: string, body: DeadlineReasonBodyType) {
    return this.negotiationService.reject(userId, id, body)
  }

  withdraw(userId: string, id: string) {
    return this.negotiationService.withdraw(userId, id)
  }

  finalizeRequest(userId: string, id: string) {
    return this.finalizeService.finalize(userId, id)
  }

  list(userId: string, roleName: string, query: ListDeadlineRequestQueryType) {
    return this.queryService.list(userId, roleName, query)
  }

  getOne(userId: string, roleName: string, id: string) {
    return this.queryService.getOne(userId, roleName, id)
  }
}
