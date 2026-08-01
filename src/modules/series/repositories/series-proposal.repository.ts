import { FranchiseConsentStatus, Prisma, ProposalStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { SeriesNotFoundException } from '../errors/series.errors'
import { CreateProposalBodyType, UpdateProposalBodyType, UpdateSeriesMetadataBodyType } from '../schemas/series-schemas'
import { SeriesMetadataField, SeriesMetadataUpdateGuard, SeriesMetadataUpdateResult } from './series-repository.types'
import { SeriesProposalCasRepository } from './series-proposal-cas.repository'

export class SeriesProposalRepository {
  private readonly cas: SeriesProposalCasRepository

  constructor(private readonly prismaService: PrismaService) {
    this.cas = new SeriesProposalCasRepository(prismaService)
  }

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
        status: 'DRAFT',
        proposal: {
          synopsis: body.synopsis ?? null,
          characterDesigns: body.characterDesigns,
          storyboardPages: body.storyboardPages ?? [],
          estimatedLength: body.estimatedLength ?? null,
          status: ProposalStatus.DRAFT
        }
      }
    })
    return series
  }

  async updateProposalContent(seriesId: string, body: UpdateProposalBodyType) {
    const result = await this.cas.update(seriesId, (series) => {
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
        (body.estimatedLength != null && body.estimatedLength !== series.proposal.estimatedLength) ||
        (body.storyboardPages != null &&
          !this.sameStoryboardPages(body.storyboardPages, series.proposal.storyboardPages))
      if (proposalChanged) {
        data.proposal = {
          set: {
            ...series.proposal,
            ...(body.synopsis != null ? { synopsis: body.synopsis } : {}),
            ...(body.characterDesigns != null ? { characterDesigns: body.characterDesigns } : {}),
            ...(body.estimatedLength != null ? { estimatedLength: body.estimatedLength } : {}),
            ...(body.storyboardPages != null ? { storyboardPages: body.storyboardPages } : {})
          }
        }
      }
      if (Object.keys(data).length === 0) return { outcome: 'UNCHANGED' }
      return { outcome: 'WRITE', data, guardProposal: proposalChanged }
    })
    return this.cas.requireWrite(result, seriesId)
  }

  async updateSeriesMetadata(
    seriesId: string,
    body: UpdateSeriesMetadataBodyType,
    guard: SeriesMetadataUpdateGuard
  ): Promise<SeriesMetadataUpdateResult> {
    const result = await this.cas.update(seriesId, (series) => {
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

  async deleteProposalSeries(seriesId: string): Promise<void> {
    // Spec 28: deleting a DRAFT proposal deletes only its owning Series row.
    // Chapter storyboards are outside this lifecycle and are not cascaded here.
    await this.prismaService.series.delete({ where: { id: seriesId } })
  }

  async updateProposalStatus(seriesId: string, status: ProposalStatus) {
    const result = await this.cas.update(seriesId, (series) => {
      if (!series.proposal) return { outcome: 'PROPOSAL_MISSING' }
      if (series.proposal.status === status) return { outcome: 'UNCHANGED' }
      return {
        outcome: 'WRITE',
        data: { proposal: { set: { ...series.proposal, status } } },
        guardProposal: true
      }
    })
    return this.cas.requireWrite(result, seriesId)
  }

  private sameStringArray(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index])
  }

  private sameStoryboardPages(
    left: readonly { pageNumber: number; fileUrl: string }[],
    right: readonly { pageNumber: number; fileUrl: string }[] | null | undefined
  ): boolean {
    const normalizedRight = right ?? []
    return (
      left.length === normalizedRight.length &&
      left.every((page, index) => {
        const rightPage = normalizedRight[index]
        return rightPage !== undefined && page.pageNumber === rightPage.pageNumber && page.fileUrl === rightPage.fileUrl
      })
    )
  }
}
