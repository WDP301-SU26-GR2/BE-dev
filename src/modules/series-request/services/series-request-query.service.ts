import { Injectable } from '@nestjs/common'
import { RoleName } from 'src/core/security/constants/role.constant'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { SeriesContextPort } from '../ports/series-context.port'
import { SeriesRequestAccessDeniedException, SeriesRequestNotFoundException } from '../errors/series-request.errors'
import { toSeriesRequestRes } from '../series-request.mapper'
import { ListSeriesRequestQueryType } from '../schemas/series-request-schemas'
import { SeriesRequestRepository } from '../series-request.repo'

@Injectable()
export class SeriesRequestQueryService {
  constructor(
    private readonly repository: SeriesRequestRepository,
    private readonly seriesContext: SeriesContextPort
  ) {}

  async list(caller: { userId: string; roleName: string }, query: ListSeriesRequestQueryType) {
    // Mangaka thấy yêu cầu bộ truyện mình sở hữu; biên tập viên thấy bộ truyện mình phụ trách;
    // Hội đồng và quản trị thấy tất cả.
    const filter: Parameters<SeriesRequestRepository['list']>[0] = {
      seriesId: query.seriesId,
      status: query.status,
      requestType: query.requestType
    }
    if (caller.roleName === RoleName.MANGAKA || caller.roleName === RoleName.EDITOR) {
      const key = caller.roleName === RoleName.MANGAKA ? 'mangakaId' : 'editorId'
      const seriesIds = await this.seriesContext.findSeriesIdsByOwner(key, caller.userId)
      filter.seriesIdIn = seriesIds
      if (seriesIds.length === 0) return { items: [], total: 0, limit: query.limit, offset: query.offset }
    }
    const [rows, total] = await Promise.all([
      this.repository.list(filter, { limit: query.limit, offset: query.offset }),
      this.repository.count(filter)
    ])
    return { items: rows.map(toSeriesRequestRes), total, limit: query.limit, offset: query.offset }
  }

  async getById(caller: { userId: string; roleName: string }, id: string) {
    if (!isObjectId(id)) throw SeriesRequestNotFoundException
    const request = await this.repository.findById(id)
    if (!request) throw SeriesRequestNotFoundException
    const series = await this.seriesContext.findById(request.seriesId)
    if (!series) throw SeriesRequestNotFoundException
    const isOwner = series.mangakaId === caller.userId
    const isEditor = series.editorId === caller.userId
    const isPrivileged = caller.roleName === RoleName.BOARD_MEMBER || caller.roleName === RoleName.SUPER_ADMIN
    if (!isOwner && !isEditor && !isPrivileged) throw SeriesRequestAccessDeniedException
    return toSeriesRequestRes(request)
  }
}
