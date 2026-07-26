import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { $Enums, Prisma } from '@prisma/client'
import { fetchSeriesMiniMap, fetchUserMiniMap } from 'src/core/models/user-mini.model'

@Injectable()
export class ReprintRequestRepo {
  constructor(private readonly prisma: PrismaService) {}

  private async attachPeople<T extends { seriesId: string | null; requestedBy: string | null }>(rows: T[]) {
    const [users, series] = await Promise.all([
      fetchUserMiniMap(
        this.prisma,
        rows.map((row) => row.requestedBy)
      ),
      fetchSeriesMiniMap(
        this.prisma,
        rows.map((row) => row.seriesId)
      )
    ])
    return rows.map((row) => ({
      ...row,
      series: row.seriesId ? (series.get(row.seriesId) ?? null) : null,
      requester: row.requestedBy ? (users.get(row.requestedBy) ?? null) : null
    }))
  }

  async create(data: Prisma.ReprintRequestUncheckedCreateInput) {
    return this.prisma.reprintRequest.create({
      data
    })
  }

  async update(id: string, data: Prisma.ReprintRequestUncheckedUpdateInput) {
    return this.prisma.reprintRequest.update({
      where: { id },
      data
    })
  }

  async compareAndSetStatus(
    id: string,
    expected: $Enums.ReprintRequestStatus,
    target: $Enums.ReprintRequestStatus,
    patch: Omit<Prisma.ReprintRequestUncheckedUpdateManyInput, 'status'> = {}
  ) {
    const result = await this.prisma.reprintRequest.updateMany({
      where: { id, status: expected },
      data: { ...patch, status: target }
    })
    if (result.count !== 1) return null
    return this.findById(id)
  }

  async findById(id: string) {
    const row = await this.prisma.reprintRequest.findUnique({
      where: { id }
    })
    if (!row) return null
    return (await this.attachPeople([row]))[0]
  }

  async findAccessContext(seriesId: string) {
    const [series, contract] = await Promise.all([
      this.prisma.series.findUnique({
        where: { id: seriesId },
        select: { editorId: true, mangakaId: true }
      }),
      this.findActiveContractBySeriesId(seriesId)
    ])
    return {
      editorId: series?.editorId ?? null,
      ownerMangakaIds: [...new Set([series?.mangakaId, contract?.mangakaId].filter((id): id is string => Boolean(id)))]
    }
  }

  // Spec 3 §4.4 + Spec 9 Part 4: MANGAKA chỉ thấy reprint của series mình (series.mangakaId===userId);
  // EDITOR chỉ thấy reprint của series mình phụ trách (series.editorId===userId).
  // Board/SuperAdmin → all.
  async findManyScoped(params: { userId: string; roleName: string; status?: string; seriesId?: string }) {
    const where: Prisma.ReprintRequestWhereInput = {}
    if (params.status) where.status = params.status as $Enums.ReprintRequestStatus
    if (params.seriesId) where.seriesId = params.seriesId
    // EDITOR scoping applies first — an editor who is also a co-owner on a series must still be
    // constrained to their owned set (defense-in-depth; mirrors series.findManyByViewer pattern).
    if (params.roleName === 'EDITOR') {
      const owned = await this.prisma.series.findMany({ where: { editorId: params.userId }, select: { id: true } })
      const ids = owned.map((s) => s.id)
      if (ids.length === 0) return []
      where.seriesId = params.seriesId && ids.includes(params.seriesId) ? params.seriesId : { in: ids }
    } else if (params.roleName === 'MANGAKA') {
      const [ownedSeries, ownedContracts] = await Promise.all([
        this.prisma.series.findMany({ where: { mangakaId: params.userId }, select: { id: true } }),
        this.prisma.contract.findMany({
          where: { mangakaId: params.userId, status: $Enums.ContractStatus.FULLY_EXECUTED },
          select: { seriesId: true }
        })
      ])
      const ids = [...new Set([...ownedSeries.map((series) => series.id), ...ownedContracts.map((c) => c.seriesId)])]
      const ownershipScope = params.seriesId
        ? ids.includes(params.seriesId)
          ? { seriesId: params.seriesId }
          : null
        : ids.length > 0
          ? { seriesId: { in: ids } }
          : null
      where.OR = [...(ownershipScope ? [ownershipScope] : []), { chapters: { some: { reviserId: params.userId } } }]
      if (params.seriesId) where.seriesId = params.seriesId
    }
    const rows = await this.prisma.reprintRequest.findMany({ where, orderBy: { createdAt: 'desc' } })
    return this.attachPeople(rows)
  }

  // Lấy hợp đồng mới nhất đang có hiệu lực thi hành đầy đủ (FULLY_EXECUTED) để xác định Ownership (B-RPT-02)
  async findActiveContractBySeriesId(seriesId: string) {
    return this.prisma.contract.findFirst({
      where: {
        seriesId,
        status: $Enums.ContractStatus.FULLY_EXECUTED
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
  }

  // Tìm danh sách các chương gốc thuộc khoảng tập yêu cầu tái bản (B-RPT-03)
  async findOriginalChaptersByRange(seriesId: string, start: number, end: number) {
    return this.prisma.chapter.findMany({
      where: {
        seriesId,
        chapterNumber: {
          gte: start,
          lte: end
        },
        status: 'PUBLISHED'
      },
      orderBy: {
        chapterNumber: 'asc'
      }
    })
  }

  // PB-07: Tra user + role để xác minh reviser khi reviserType=OTHER_MANGAKA phải là role MANGAKA
  async findUserRole(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, include: { role: true } })
  }
}
