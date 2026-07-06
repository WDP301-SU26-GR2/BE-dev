import { Injectable } from '@nestjs/common'
import { NameStatus, Prisma, ProposalStatus, PublicationType, SeriesStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { SeriesNotFoundException } from './errors/series.errors'
import { CreateProposalBodyType, UpdateProposalBodyType } from './schemas/series-schemas'

// Trạng thái series "đang chờ editor pick-up" (chưa gán editor) — hàng đợi review của Editor.
const REVIEW_QUEUE_STATES: SeriesStatus[] = [SeriesStatus.IN_REVIEW]
const BOARD_HIDDEN_STATES: SeriesStatus[] = [SeriesStatus.DRAFT, SeriesStatus.WITHDRAWN]

export type SeriesListScope = { kind: 'mangaka'; userId: string } | { kind: 'editor'; userId: string } | { kind: 'all' }

export type SeriesListFilter = {
  scope: SeriesListScope
  status?: SeriesStatus
}

@Injectable()
export class SeriesRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async createProposalSeries(mangakaId: string, body: CreateProposalBodyType) {
    const series = await this.prismaService.series.create({
      data: {
        mangakaId,
        title: body.title,
        coverImage: body.coverImage ?? null,
        genres: body.genres ?? [],
        demographic: body.demographic ?? null,
        publicationType: body.publicationType ?? null,
        parentSeriesId: body.parentSeriesId ?? null,
        relationshipType: body.relationshipType ?? null,
        status: SeriesStatus.DRAFT,
        proposal: {
          synopsis: body.synopsis ?? null,
          characterDesigns: body.characterDesigns,
          estimatedLength: body.estimatedLength ?? null,
          status: ProposalStatus.DRAFT
        }
      }
    })

    const name = await this.prismaService.name.create({
      data: {
        seriesId: series.id,
        chapterNumber: null,
        status: NameStatus.DRAFT,
        version: 1,
        pages: body.namePages.map((p) => ({ pageNumber: p.pageNumber, fileUrl: p.fileUrl }))
      }
    })

    // `proposal` là composite OPTIONAL → Prisma chỉ hỗ trợ set/upsert/unset (KHÔNG có partial `update`).
    // Phải `set` cả object cũ + nameId, nếu không sẽ ghi đè rỗng synopsis/characterDesigns/... (data loss).
    const updated = await this.prismaService.series.update({
      where: { id: series.id },
      data: { proposal: { set: { ...series.proposal, nameId: name.id } } }
    })

    return { series: updated, name }
  }

  async findById(seriesId: string) {
    return await this.prismaService.series.findUnique({ where: { id: seriesId } })
  }

  async findNameById(nameId: string) {
    return await this.prismaService.name.findUnique({ where: { id: nameId } })
  }

  async updateProposalContent(seriesId: string, body: UpdateProposalBodyType) {
    const series = await this.prismaService.series.findUnique({ where: { id: seriesId } })
    if (!series?.proposal) throw SeriesNotFoundException

    const data: Prisma.SeriesUpdateInput = {}
    if (body.title != null) data.title = body.title
    if (body.coverImage != null) data.coverImage = body.coverImage
    if (body.genres != null) data.genres = body.genres
    if (body.demographic != null) data.demographic = body.demographic
    if (body.publicationType != null) data.publicationType = body.publicationType
    data.proposal = {
      set: {
        ...series.proposal,
        synopsis: body.synopsis ?? series.proposal.synopsis,
        characterDesigns: body.characterDesigns ?? series.proposal.characterDesigns,
        estimatedLength: body.estimatedLength ?? series.proposal.estimatedLength
      }
    }

    const updated = await this.prismaService.series.update({
      where: { id: seriesId },
      data
    })

    return updated
  }

  async deleteSeriesWithNames(seriesId: string): Promise<void> {
    await this.prismaService.$transaction([
      this.prismaService.name.deleteMany({ where: { seriesId } }),
      this.prismaService.series.delete({ where: { id: seriesId } })
    ])
  }

  async updateProposalStatus(seriesId: string, status: ProposalStatus) {
    const series = await this.prismaService.series.findUnique({ where: { id: seriesId } })
    if (!series?.proposal) throw SeriesNotFoundException
    // `set` full (composite optional không partial-update được) — giữ nguyên nameId/synopsis/...
    return await this.prismaService.series.update({
      where: { id: seriesId },
      data: { proposal: { set: { ...series.proposal, status } } }
    })
  }

  async claimSeries(seriesId: string, editorId: string): Promise<number> {
    const result = await this.prismaService.series.updateMany({
      where: { id: seriesId, editorId: { isSet: false }, status: SeriesStatus.IN_REVIEW },
      data: { editorId }
    })
    return result.count
  }

  async releaseSeries(seriesId: string, editorId: string): Promise<number> {
    const result = await this.prismaService.series.updateMany({
      where: { id: seriesId, editorId, reviewStartedAt: { isSet: false }, status: SeriesStatus.IN_REVIEW },
      data: { editorId: { unset: true } }
    })
    return result.count
  }

  async markReviewStarted(seriesId: string): Promise<void> {
    await this.prismaService.series.updateMany({
      where: { id: seriesId, reviewStartedAt: { isSet: false } },
      data: { reviewStartedAt: new Date() }
    })
  }

  async updateNameStatus(nameId: string, data: { status: NameStatus; version?: number; submittedAt?: Date }) {
    return await this.prismaService.name.update({ where: { id: nameId }, data })
  }

  async updateNamePages(nameId: string, pages: { pageNumber: number; fileUrl: string }[]) {
    return await this.prismaService.name.update({ where: { id: nameId }, data: { pages: { set: pages } } })
  }

  async appendNamePage(nameId: string, page: { pageNumber: number; fileUrl: string }) {
    return await this.prismaService.name.update({ where: { id: nameId }, data: { pages: { push: page } } })
  }

  // Single-writer cho Series.status: chỉ method này (gọi từ SeriesStateService) ghi status + audit.
  // KHÔNG đụng `proposal` (composite) nên không bị wipe; chỉ set scalar `status`/`statusReason` + push history.
  async updateStatusWithHistory(
    seriesId: string,
    entry: { fromStatus: SeriesStatus; toStatus: SeriesStatus; changedBy: string | null; reason?: string }
  ) {
    return await this.prismaService.series.update({
      where: { id: seriesId },
      data: {
        status: entry.toStatus,
        statusReason: entry.reason,
        statusHistory: {
          push: {
            fromStatus: entry.fromStatus,
            toStatus: entry.toStatus,
            changedBy: entry.changedBy,
            reason: entry.reason ?? null,
            at: new Date()
          }
        }
      }
    })
  }

  // Mongo gotcha: editorId của series do Mangaka tạo là ABSENT → hàng đợi phải dùng `isSet:false`,
  // KHÔNG `editorId:null` (không match doc absent → trả rỗng). Xem AGENTS §10.
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
      return statusWhere ? { AND: [statusWhere, boardVisibilityWhere], ...scopeWhere } : { ...boardVisibilityWhere }
    }
    return { ...(statusWhere ?? {}), ...scopeWhere }
  }

  async findSeriesForList(filter: SeriesListFilter, page: { limit: number; offset: number }) {
    const where = this.buildSeriesListWhere(filter)
    return await this.prismaService.series.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: page.offset,
      take: page.limit
    })
  }

  async countSeriesForList(filter: SeriesListFilter): Promise<number> {
    const where = this.buildSeriesListWhere(filter)
    return await this.prismaService.series.count({ where })
  }

  async findNamesBySeriesId(seriesId: string) {
    return await this.prismaService.name.findMany({
      where: { seriesId },
      orderBy: { version: 'asc' }
    })
  }

  // Spec 2: HIATUS timestamp — set when entering hiatus, null when resumed.
  async setHiatusStartedAt(seriesId: string, date: Date | null) {
    await this.prismaService.series.update({
      where: { id: seriesId },
      data: { hiatusStartedAt: date }
    })
  }

  // Spec 2: N ending chapters Board grants on CANCELLATION (informational).
  async setEndingChapterAllowance(seriesId: string, allowance: number | null) {
    await this.prismaService.series.update({
      where: { id: seriesId },
      data: { endingChapterAllowance: allowance }
    })
  }

  // Spec 2: change publicationType (FORMAT_CHANGE) — partial, NOT touching magazine/startIssueNumber (avoid clobber).
  async updatePublicationType(seriesId: string, publicationType: PublicationType) {
    await this.prismaService.series.update({
      where: { id: seriesId },
      data: { publicationType }
    })
  }

  // Spec 2: write Flow 1 serialization slot (magazine + startIssueNumber + publicationType) before
  // transitioning PITCHED -> SERIALIZED. Magazine/startIssueNumber are still null until this runs,
  // so this is a safe `set` (no prior value to clobber).
  async updateSerializationSlot(
    seriesId: string,
    slot: { magazine: string; startIssueNumber: number; publicationType: string }
  ) {
    await this.prismaService.series.update({
      where: { id: seriesId },
      data: {
        magazine: slot.magazine,
        startIssueNumber: slot.startIssueNumber,
        publicationType: slot.publicationType as PublicationType
      }
    })
  }
}
