import { Injectable } from '@nestjs/common'
import { toSeriesRequestRes } from './series-request.mapper'
import {
  AcceptSeriesRequestBodyType,
  CreateSeriesRequestBodyType,
  ListSeriesRequestQueryType,
  RejectSeriesRequestBodyType
} from './schemas/series-request-schemas'
import { SeriesRequestCreateService } from './services/series-request-create.service'
import { SeriesRequestDecisionService } from './services/series-request-decision.service'
import { SeriesRequestQueryService } from './services/series-request-query.service'

@Injectable()
export class SeriesRequestService {
  constructor(
    private readonly createService: SeriesRequestCreateService,
    private readonly decisionService: SeriesRequestDecisionService,
    private readonly queryService: SeriesRequestQueryService
  ) {}

  async create(mangakaId: string, body: CreateSeriesRequestBodyType) {
    return toSeriesRequestRes(await this.createService.create(mangakaId, body))
  }

  async cancel(mangakaId: string, id: string) {
    return toSeriesRequestRes(await this.createService.cancel(mangakaId, id))
  }

  async accept(editorId: string, id: string, body: AcceptSeriesRequestBodyType) {
    return toSeriesRequestRes(await this.decisionService.accept(editorId, id, body))
  }

  async reject(editorId: string, id: string, body: RejectSeriesRequestBodyType) {
    return toSeriesRequestRes(await this.decisionService.reject(editorId, id, body))
  }

  list(caller: { userId: string; roleName: string }, query: ListSeriesRequestQueryType) {
    return this.queryService.list(caller, query)
  }

  getById(caller: { userId: string; roleName: string }, id: string) {
    return this.queryService.getById(caller, id)
  }
}
