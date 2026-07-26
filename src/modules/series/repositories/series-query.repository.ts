import { Prisma, Series, SeriesStatus } from '@prisma/client'
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
    const statusWhere: Prisma.SeriesWhereInput | undefined = filter.status ? { status: filter.status } : undefined
    const boardVisibilityWhere: Prisma.SeriesWhereInput = { status: { notIn: BOARD_HIDDEN_STATES } }
    const scopeWhere: Prisma.SeriesWhereInput =
      scope.kind === 'mangaka'
        ? { mangakaId: scope.userId }
        : scope.kind === 'editor'
          ? {
              OR: [{ editorId: scope.userId }, { editorId: { isSet: false }, status: { in: REVIEW_QUEUE_STATES } }]
            }
          : {}
    if (scope.kind === 'all') {
      return statusWhere ? { AND: [statusWhere, boardVisibilityWhere], ...scopeWhere } : boardVisibilityWhere
    }
    return { ...(statusWhere ?? {}), ...scopeWhere }
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
}
