import { Prisma, Series, SeriesStatus, TaskStatus } from '@prisma/client'
import { USER_MINI_FIELDS, UserMiniRow } from 'src/core/models/user-mini.model'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { SeriesListFilter } from './series-repository.types'

const REVIEW_QUEUE_STATES: SeriesStatus[] = [SeriesStatus.IN_REVIEW]
const BOARD_HIDDEN_STATES: SeriesStatus[] = [SeriesStatus.DRAFT, SeriesStatus.WITHDRAWN]

export class SeriesQueryRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findById(seriesId: string) {
    const series = await this.prismaService.series.findUnique({ where: { id: seriesId } })
    if (!series) return null
    const people = await this.findUserMinisByIds([series.mangakaId, ...(series.editorId ? [series.editorId] : [])])
    return this.withPeople(series, people)
  }

  private buildSeriesListWhere(filter: SeriesListFilter): Prisma.SeriesWhereInput {
    const scope = filter.scope
    const conditions: Prisma.SeriesWhereInput[] = []
    if (filter.status) conditions.push({ status: filter.status })
    // Lọc theo tạp chí + nhịp phát hành: Super Admin cần đúng nhóm này để chọn `eligibleSeriesIds` khi mở kỳ
    // bình chọn (BR-VOTE-05) — trước đây phải tải hết rồi lọc phía client nên dễ sót series ở trang sau.
    if (filter.magazine) conditions.push({ magazine: filter.magazine })
    if (filter.publicationType) conditions.push({ publicationType: filter.publicationType })
    if (scope.kind === 'mangaka') {
      conditions.push({ mangakaId: scope.userId })
    } else if (scope.kind === 'editor') {
      conditions.push({
        OR: [{ editorId: scope.userId }, { editorId: { isSet: false }, status: { in: REVIEW_QUEUE_STATES } }]
      })
    } else {
      conditions.push({ status: { notIn: BOARD_HIDDEN_STATES } })
    }
    return conditions.length === 1 ? conditions[0] : { AND: conditions }
  }

  async findSeriesForList(filter: SeriesListFilter, page: { limit: number; offset: number }) {
    const rows = await this.prismaService.series.findMany({
      where: this.buildSeriesListWhere(filter),
      orderBy: { createdAt: 'desc' },
      skip: page.offset,
      take: page.limit
    })
    if (rows.length === 0) return []
    const people = await this.findUserMinisByIds(
      rows.flatMap((series) => [series.mangakaId, ...(series.editorId ? [series.editorId] : [])])
    )
    return rows.map((series) => this.withPeople(series, people))
  }

  countSeriesForList(filter: SeriesListFilter): Promise<number> {
    return this.prismaService.series.count({ where: this.buildSeriesListWhere(filter) })
  }

  private async findUserMinisByIds(ids: string[]) {
    const rows = await this.prismaService.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: USER_MINI_FIELDS
    })
    return new Map(rows.map((user) => [user.id, user] as const))
  }

  private withPeople(series: Series, people: Map<string, UserMiniRow>) {
    const mangaka = people.get(series.mangakaId)
    return {
      ...series,
      ...(mangaka ? { mangaka } : {}),
      editor: series.editorId ? (people.get(series.editorId) ?? null) : null
    }
  }

  countChaptersBySeriesId(seriesId: string): Promise<number> {
    return this.prismaService.chapter.count({ where: { seriesId } })
  }

  async findExecutedContractType(seriesId: string): Promise<'FULL_BUYOUT' | 'REVENUE_SHARE' | null> {
    const contract = await this.prismaService.contract.findFirst({
      where: { seriesId, status: 'FULLY_EXECUTED' },
      select: { contractType: true }
    })
    return contract?.contractType ?? null
  }

  findHiatusStartedBefore(cutoff: Date) {
    return this.prismaService.series.findMany({
      where: { status: SeriesStatus.HIATUS, hiatusStartedAt: { lt: cutoff } }
    })
  }

  async findBoardMemberIds(): Promise<string[]> {
    const role = await this.prismaService.role.findFirst({
      where: { code: 'BOARD_MEMBER' },
      select: { id: true }
    })
    if (!role) return []
    const users = await this.prismaService.user.findMany({
      where: { roleId: role.id, deletedAt: { isSet: false } },
      select: { id: true }
    })
    return users.map((user) => user.id)
  }

  // Spec 30: danh sách id Series mà user làm chủ hoặc được phân công — query scoping cho SeriesRequest.
  async findSeriesIdsByOwner(key: 'mangakaId' | 'editorId', userId: string): Promise<string[]> {
    const rows = await this.prismaService.series.findMany({ where: { [key]: userId }, select: { id: true } })
    return rows.map((row) => row.id)
  }

  // Spec 30: trợ lý đang giữ công việc CHƯA kết thúc trong bộ truyện — dùng cho notify khi HIATUS / RESUME.
  async findActiveAssistantIdsBySeries(seriesId: string): Promise<string[]> {
    const chapters = await this.prismaService.chapter.findMany({ where: { seriesId }, select: { id: true } })
    if (chapters.length === 0) return []
    const pages = await this.prismaService.page.findMany({
      where: { chapterId: { in: chapters.map((chapter) => chapter.id) } },
      select: { id: true }
    })
    if (pages.length === 0) return []
    const tasks = await this.prismaService.task.findMany({
      where: {
        pageId: { in: pages.map((page) => page.id) },
        status: { notIn: [TaskStatus.APPROVED, TaskStatus.CANCELLED] }
      },
      select: { assistantId: true }
    })
    return [...new Set(tasks.map((task) => task.assistantId).filter((id): id is string => Boolean(id)))]
  }
}
