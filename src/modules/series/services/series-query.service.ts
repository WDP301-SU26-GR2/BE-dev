import { Injectable } from '@nestjs/common'
import { Series, SeriesStatus } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { SeriesAccessDeniedException, SeriesNotFoundException } from '../errors/series.errors'
import { toSeriesRes } from '../series.mapper'
import { SeriesListScope, SeriesRepository } from '../series.repo'
import { ListSeriesQueryType } from '../schemas/series-schemas'

export type SeriesCaller = { userId: string; roleName: string }

// Series chưa gán editor + đang ở các state này = hàng đợi review (Editor nào cũng thấy được để pick-up).
const REVIEW_QUEUE_STATES = new Set<SeriesStatus>([SeriesStatus.IN_REVIEW])
const BOARD_HIDDEN_STATES = new Set<SeriesStatus>([SeriesStatus.DRAFT, SeriesStatus.WITHDRAWN])

// Guard format ObjectId: id rác (vd 'proposals' khi ai đó gọi GET /series/proposals khớp @Get(':id'))
// → trả 404 sạch thay vì để Prisma ném P2023 (Malformed ObjectID) → 500.
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class SeriesQueryService {
  constructor(private readonly seriesRepository: SeriesRepository) {}

  async list(caller: SeriesCaller, query: ListSeriesQueryType) {
    const filter = { scope: this.scopeForRole(caller), status: query.status }
    const [rows, total] = await Promise.all([
      this.seriesRepository.findSeriesForList(filter, { limit: query.limit, offset: query.offset }),
      this.seriesRepository.countSeriesForList(filter)
    ])
    return {
      items: rows.map(toSeriesRes),
      total,
      limit: query.limit,
      offset: query.offset
    }
  }

  async getById(caller: SeriesCaller, seriesId: string) {
    const series = await this.requireVisibleSeries(caller, seriesId)
    return toSeriesRes(series)
  }

  private async requireVisibleSeries(caller: SeriesCaller, seriesId: string): Promise<Series> {
    if (!OBJECT_ID_RE.test(seriesId)) throw SeriesNotFoundException
    const series = await this.seriesRepository.findById(seriesId)
    if (!series) throw SeriesNotFoundException
    if (!this.canView(series, caller)) throw SeriesAccessDeniedException
    return series
  }

  private scopeForRole(caller: SeriesCaller): SeriesListScope {
    if (caller.roleName === RoleName.MANGAKA) return { kind: 'mangaka', userId: caller.userId }
    if (caller.roleName === RoleName.EDITOR) return { kind: 'editor', userId: caller.userId }
    return { kind: 'all' } // SUPER_ADMIN / BOARD_MEMBER (route @Roles giới hạn còn 4 role này)
  }

  // In-memory check (không phải query) → dùng được `!series.editorId` cho cả null lẫn absent.
  private canView(series: Series, caller: SeriesCaller): boolean {
    const r = caller.roleName
    if (r === RoleName.SUPER_ADMIN || r === RoleName.BOARD_MEMBER) return !BOARD_HIDDEN_STATES.has(series.status)
    if (r === RoleName.MANGAKA) return series.mangakaId === caller.userId
    if (r === RoleName.EDITOR) {
      return series.editorId === caller.userId || (!series.editorId && REVIEW_QUEUE_STATES.has(series.status))
    }
    return false
  }
}
