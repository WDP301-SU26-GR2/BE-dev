import { Injectable } from '@nestjs/common'
import {
  FranchiseConsentStatus,
  NameKind,
  NameStatus,
  Prisma,
  ProposalStatus,
  PublicationType,
  Series,
  SeriesStatus
} from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { SeriesNotFoundException } from './errors/series.errors'
import { CreateProposalBodyType, UpdateProposalBodyType, UpdateSeriesMetadataBodyType } from './schemas/series-schemas'
import { SERIES_PROPOSAL_CAS_MAX_ATTEMPTS } from './series.constant'

// Trạng thái series "đang chờ editor pick-up" (chưa gán editor) — hàng đợi review của Editor.
const REVIEW_QUEUE_STATES: SeriesStatus[] = [SeriesStatus.IN_REVIEW]
const BOARD_HIDDEN_STATES: SeriesStatus[] = [SeriesStatus.DRAFT, SeriesStatus.WITHDRAWN]

export type SeriesListScope = { kind: 'mangaka'; userId: string } | { kind: 'editor'; userId: string } | { kind: 'all' }

export type SeriesListFilter = {
  scope: SeriesListScope
  status?: SeriesStatus
}

export type SeriesMetadataUpdateResult =
  | { outcome: 'UPDATED'; series: Series; changedFields: SeriesMetadataField[] }
  | { outcome: 'UNCHANGED'; series: Series }
  | { outcome: 'GUARD_MISMATCH'; series: Series }
  | { outcome: 'RETRY_EXHAUSTED'; series: Series }

export type SeriesMetadataField = 'title' | 'coverImage' | 'synopsis' | 'characterDesigns'

export type SeriesMetadataUpdateGuard = {
  authorization: { kind: 'OWNER' | 'EDITOR'; userId: string }
  blockedStatuses: SeriesStatus[]
}

type SeriesProposalCasMutation =
  | { outcome: 'UNCHANGED' }
  | { outcome: 'GUARD_MISMATCH' }
  | { outcome: 'PROPOSAL_MISSING' }
  | {
      outcome: 'WRITE'
      data: Prisma.SeriesUpdateManyMutationInput
      where?: Prisma.SeriesWhereInput
      guardProposal: boolean
      changedFields?: SeriesMetadataField[]
    }

type SeriesProposalCasResult =
  | { outcome: 'UPDATED'; series: Series; changedFields: SeriesMetadataField[] }
  | { outcome: 'UNCHANGED'; series: Series }
  | { outcome: 'GUARD_MISMATCH'; series: Series }
  | { outcome: 'PROPOSAL_MISSING'; series: Series }
  | { outcome: 'NOT_FOUND' }
  | { outcome: 'RETRY_EXHAUSTED'; series: Series }

export class SeriesProposalCasExhaustedError extends Error {
  constructor(seriesId: string) {
    super(`Series proposal write conflict after ${SERIES_PROPOSAL_CAS_MAX_ATTEMPTS} attempts: ${seriesId}`)
    this.name = 'SeriesProposalCasExhaustedError'
  }
}

@Injectable()
export class SeriesRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async createProposalSeries(
    mangakaId: string,
    body: CreateProposalBodyType,
    franchiseConsentStatus?: FranchiseConsentStatus
  ) {
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
        franchiseConsentStatus: franchiseConsentStatus ?? null,
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
        // kind=PROPOSAL set explicitly: this is the only Name write outside NameRepo (atomic with proposal creation).
        kind: NameKind.PROPOSAL,
        status: NameStatus.DRAFT,
        version: 1,
        pages: body.namePages.map((p) => ({ pageNumber: p.pageNumber, fileUrl: p.fileUrl }))
      }
    })

    // `proposal` là composite OPTIONAL → Prisma chỉ hỗ trợ set/upsert/unset (KHÔNG có partial `update`).
    // Phải `set` cả object cũ + nameId, nếu không sẽ ghi đè rỗng synopsis/characterDesigns/... (data loss).
    const linked = await this.updateSeriesWithProposalCas(series.id, (current) => {
      if (!current.proposal) return { outcome: 'PROPOSAL_MISSING' }
      if (current.proposal.nameId === name.id) return { outcome: 'UNCHANGED' }
      return {
        outcome: 'WRITE',
        data: { proposal: { set: { ...current.proposal, nameId: name.id } } },
        // The freshly-created Series id has not escaped this request yet, so no
        // external writer can race this initial link.  Do not compare the full
        // composite here: Mongo stores an omitted optional nameId while Prisma
        // hydrates it as null, and `{ equals: current.proposal }` can therefore
        // never match this one legacy-shaped document.
        guardProposal: false
      }
    })
    const updated = this.requireProposalCasWrite(linked, series.id)

    return { series: updated, name }
  }

  async findById(seriesId: string) {
    return await this.prismaService.series.findUnique({ where: { id: seriesId } })
  }

  async updateProposalContent(seriesId: string, body: UpdateProposalBodyType) {
    const result = await this.updateSeriesWithProposalCas(seriesId, (series) => {
      if (!series.proposal) return { outcome: 'PROPOSAL_MISSING' }

      const data: Prisma.SeriesUpdateManyMutationInput = {}
      if (body.title != null && body.title !== series.title) data.title = body.title
      if (body.coverImage != null && body.coverImage !== series.coverImage) data.coverImage = body.coverImage
      if (body.genres != null && !this.sameStringArray(body.genres, series.genres)) data.genres = body.genres
      if (body.demographic != null && body.demographic !== series.demographic) data.demographic = body.demographic
      if (body.publicationType != null && body.publicationType !== series.publicationType) {
        data.publicationType = body.publicationType
      }

      const proposalChanged =
        (body.synopsis != null && body.synopsis !== series.proposal.synopsis) ||
        (body.characterDesigns != null &&
          !this.sameStringArray(body.characterDesigns, series.proposal.characterDesigns)) ||
        (body.estimatedLength != null && body.estimatedLength !== series.proposal.estimatedLength)
      if (proposalChanged) {
        data.proposal = {
          set: {
            ...series.proposal,
            ...(body.synopsis != null ? { synopsis: body.synopsis } : {}),
            ...(body.characterDesigns != null ? { characterDesigns: body.characterDesigns } : {}),
            ...(body.estimatedLength != null ? { estimatedLength: body.estimatedLength } : {})
          }
        }
      }

      if (Object.keys(data).length === 0) return { outcome: 'UNCHANGED' }
      return { outcome: 'WRITE', data, guardProposal: proposalChanged }
    })
    return this.requireProposalCasWrite(result, seriesId)
  }

  /**
   * Spec 14 §2.5 — PATCH metadata.
   * `Series.proposal` là optional composite: Prisma Mongo chỉ hỗ trợ set/upsert/unset, không partial update.
   * Luôn read-modify-write toàn bộ object để không làm mất nameId/status/createdAt và các field không đổi.
   */
  async updateSeriesMetadata(
    seriesId: string,
    body: UpdateSeriesMetadataBodyType,
    guard: SeriesMetadataUpdateGuard
  ): Promise<SeriesMetadataUpdateResult> {
    const result = await this.updateSeriesWithProposalCas(seriesId, (series) => {
      const authorized =
        guard.authorization.kind === 'OWNER'
          ? series.mangakaId === guard.authorization.userId
          : series.editorId === guard.authorization.userId
      if (!authorized || guard.blockedStatuses.includes(series.status)) return { outcome: 'GUARD_MISMATCH' }

      const changedFields: SeriesMetadataField[] = []
      const data: Prisma.SeriesUpdateManyMutationInput = {}
      if (body.title != null && body.title !== series.title) {
        data.title = body.title
        changedFields.push('title')
      }
      if (body.coverImage != null && body.coverImage !== series.coverImage) {
        data.coverImage = body.coverImage
        changedFields.push('coverImage')
      }

      const synopsisChanged = body.synopsis != null && series.proposal && body.synopsis !== series.proposal.synopsis
      const designsChanged =
        body.characterDesigns != null &&
        series.proposal &&
        !this.sameStringArray(body.characterDesigns, series.proposal.characterDesigns)
      const touchesProposal = Boolean(synopsisChanged || designsChanged)
      if (touchesProposal && series.proposal) {
        if (synopsisChanged) changedFields.push('synopsis')
        if (designsChanged) changedFields.push('characterDesigns')
        data.proposal = {
          set: {
            ...series.proposal,
            ...(synopsisChanged ? { synopsis: body.synopsis } : {}),
            ...(designsChanged ? { characterDesigns: body.characterDesigns! } : {})
          }
        }
      }

      if (changedFields.length === 0) return { outcome: 'UNCHANGED' }
      const authorizationWhere: Prisma.SeriesWhereInput =
        guard.authorization.kind === 'OWNER'
          ? { mangakaId: guard.authorization.userId }
          : { editorId: guard.authorization.userId }
      return {
        outcome: 'WRITE',
        data,
        where: { ...authorizationWhere, status: { notIn: guard.blockedStatuses } },
        guardProposal: touchesProposal,
        changedFields
      }
    })

    if (result.outcome === 'NOT_FOUND') throw SeriesNotFoundException
    if (result.outcome === 'PROPOSAL_MISSING') return { outcome: 'UNCHANGED', series: result.series }
    return result
  }

  private async updateSeriesWithProposalCas(
    seriesId: string,
    buildMutation: (series: Series) => SeriesProposalCasMutation
  ): Promise<SeriesProposalCasResult> {
    let series = await this.prismaService.series.findUnique({ where: { id: seriesId } })
    if (!series) return { outcome: 'NOT_FOUND' }

    for (let attempt = 0; attempt < SERIES_PROPOSAL_CAS_MAX_ATTEMPTS; attempt += 1) {
      const mutation = buildMutation(series)
      if (mutation.outcome !== 'WRITE') return { outcome: mutation.outcome, series }

      const guarded = await this.prismaService.series.updateMany({
        where: {
          id: seriesId,
          ...(mutation.where ?? {}),
          ...(mutation.guardProposal
            ? { proposal: series.proposal ? { equals: series.proposal } : { isSet: false } }
            : {})
        },
        data: mutation.data
      })

      if (guarded.count === 1) {
        const updated = await this.prismaService.series.findUnique({ where: { id: seriesId } })
        if (!updated) return { outcome: 'NOT_FOUND' }
        return { outcome: 'UPDATED', series: updated, changedFields: mutation.changedFields ?? [] }
      }

      const latest = await this.prismaService.series.findUnique({ where: { id: seriesId } })
      if (!latest) return { outcome: 'NOT_FOUND' }
      series = latest
      if (attempt === SERIES_PROPOSAL_CAS_MAX_ATTEMPTS - 1) return { outcome: 'RETRY_EXHAUSTED', series }
    }

    return { outcome: 'RETRY_EXHAUSTED', series }
  }

  private requireProposalCasWrite(result: SeriesProposalCasResult, seriesId: string): Series {
    if (result.outcome === 'UPDATED' || result.outcome === 'UNCHANGED') return result.series
    if (result.outcome === 'NOT_FOUND' || result.outcome === 'PROPOSAL_MISSING') throw SeriesNotFoundException
    throw new SeriesProposalCasExhaustedError(seriesId)
  }

  private sameStringArray(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index])
  }

  async deleteSeriesWithNames(seriesId: string): Promise<void> {
    await this.prismaService.$transaction([
      this.prismaService.name.deleteMany({ where: { seriesId } }),
      this.prismaService.series.delete({ where: { id: seriesId } })
    ])
  }

  async updateProposalStatus(seriesId: string, status: ProposalStatus) {
    const result = await this.updateSeriesWithProposalCas(seriesId, (series) => {
      if (!series.proposal) return { outcome: 'PROPOSAL_MISSING' }
      if (series.proposal.status === status) return { outcome: 'UNCHANGED' }
      // `set` full (composite optional không partial-update được) — giữ nguyên nameId/synopsis/...
      return {
        outcome: 'WRITE',
        data: { proposal: { set: { ...series.proposal, status } } },
        guardProposal: true
      }
    })
    return this.requireProposalCasWrite(result, seriesId)
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

  // Spec 2: HIATUS timestamp — set when entering hiatus, null when resumed.
  async setHiatusStartedAt(seriesId: string, date: Date | null) {
    await this.prismaService.series.update({
      where: { id: seriesId },
      data: { hiatusStartedAt: date }
    })
  }

  // Spec 2 + Fix-1: N ending chapters Board grants on CANCELLATION — ENFORCED bởi chapter-creation guard.
  async setEndingChapterAllowance(seriesId: string, allowance: number | null, chapterCountAtCancelling?: number) {
    await this.prismaService.series.update({
      where: { id: seriesId },
      data: {
        endingChapterAllowance: allowance,
        ...(chapterCountAtCancelling !== undefined ? { chapterCountAtCancelling } : {})
      }
    })
  }

  // Fix-1 G-1: đếm chapter để snapshot lúc vào CANCELLING.
  countChaptersBySeriesId(seriesId: string): Promise<number> {
    return this.prismaService.chapter.count({ where: { seriesId } })
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

  // Spec 3 §4.5: contractType của Contract FULLY_EXECUTED (gate franchise). null nếu chưa có.
  async findExecutedContractType(seriesId: string): Promise<'FULL_BUYOUT' | 'REVENUE_SHARE' | null> {
    const contract = await this.prismaService.contract.findFirst({
      where: { seriesId, status: 'FULLY_EXECUTED' },
      select: { contractType: true }
    })
    return contract?.contractType ?? null
  }

  async setFranchiseConsentStatus(seriesId: string, status: FranchiseConsentStatus) {
    return await this.prismaService.series.update({
      where: { id: seriesId },
      data: { franchiseConsentStatus: status }
    })
  }

  // PB-06: Mangaka/Editor proposes natural completion. `completionProposal` is a composite optional,
  // so we must `set` the whole object (Prisma does not support partial composite updates).
  setCompletionProposal(
    seriesId: string,
    proposal: {
      proposedByRole: string
      proposedById: string
      reason: string
      proposedEndingChapters?: number | null
      proposedAt: Date
    }
  ) {
    return this.prismaService.series.update({
      where: { id: seriesId },
      data: {
        completionProposal: {
          set: { ...proposal, proposedEndingChapters: proposal.proposedEndingChapters ?? null }
        }
      }
    })
  }

  // PB-06 (cron): HIATUS series whose hiatusStartedAt is older than `cutoff`.
  findHiatusStartedBefore(cutoff: Date) {
    return this.prismaService.series.findMany({
      where: { status: SeriesStatus.HIATUS, hiatusStartedAt: { lt: cutoff } }
    })
  }

  // PB-06 (cron): recipients list = every active Board Member. Used to escalate overlong hiatus.
  // Mongo gotcha: filter on `role.code` (relation field) is unreliable — resolve roleId first,
  // then filter `User.roleId`. Same pattern as chapter.repo.findBoardMemberIds.
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
    return users.map((u) => u.id)
  }
}
