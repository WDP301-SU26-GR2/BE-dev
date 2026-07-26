import { Injectable } from '@nestjs/common'
import { FranchiseConsentStatus, PublicationType, SeriesStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { SeriesCommandRepository } from './repositories/series-command.repository'
import { SeriesProposalCasExhaustedError } from './repositories/series-proposal-cas.repository'
import { SeriesProposalRepository } from './repositories/series-proposal.repository'
import { SeriesQueryRepository } from './repositories/series-query.repository'
import { SeriesListFilter } from './repositories/series-repository.types'

export { SeriesProposalCasExhaustedError }
export type {
  SeriesListFilter,
  SeriesListScope,
  SeriesMetadataField,
  SeriesMetadataUpdateGuard,
  SeriesMetadataUpdateResult
} from './repositories/series-repository.types'

/**
 * Stable module-private facade. Proposal CAS persistence, general commands and
 * read models are split by lifecycle while existing services keep one API.
 */
@Injectable()
export class SeriesRepository extends SeriesProposalRepository {
  private readonly commands: SeriesCommandRepository
  private readonly queries: SeriesQueryRepository

  constructor(prismaService: PrismaService) {
    super(prismaService)
    this.queries = new SeriesQueryRepository(prismaService)
    this.commands = new SeriesCommandRepository(prismaService, this)
  }

  findById(seriesId: string) {
    return this.queries.findById(seriesId)
  }

  findSeriesForList(filter: SeriesListFilter, page: { limit: number; offset: number }) {
    return this.queries.findSeriesForList(filter, page)
  }

  countSeriesForList(filter: SeriesListFilter): Promise<number> {
    return this.queries.countSeriesForList(filter)
  }

  countChaptersBySeriesId(seriesId: string): Promise<number> {
    return this.queries.countChaptersBySeriesId(seriesId)
  }

  findExecutedContractType(seriesId: string): Promise<'FULL_BUYOUT' | 'REVENUE_SHARE' | null> {
    return this.queries.findExecutedContractType(seriesId)
  }

  findHiatusStartedBefore(cutoff: Date) {
    return this.queries.findHiatusStartedBefore(cutoff)
  }

  findBoardMemberIds(): Promise<string[]> {
    return this.queries.findBoardMemberIds()
  }

  claimSeries(seriesId: string, editorId: string): Promise<number> {
    return this.commands.claimSeries(seriesId, editorId)
  }

  releaseSeries(seriesId: string, editorId: string): Promise<number> {
    return this.commands.releaseSeries(seriesId, editorId)
  }

  reopenSeriesToDraft(seriesId: string) {
    return this.commands.reopenSeriesToDraft(seriesId)
  }

  markReviewStarted(seriesId: string): Promise<void> {
    return this.commands.markReviewStarted(seriesId)
  }

  updateStatusWithHistory(
    seriesId: string,
    entry: { fromStatus: SeriesStatus; toStatus: SeriesStatus; changedBy: string | null; reason?: string }
  ) {
    return this.commands.updateStatusWithHistory(seriesId, entry)
  }

  setHiatusStartedAt(seriesId: string, date: Date | null) {
    return this.commands.setHiatusStartedAt(seriesId, date)
  }

  setEndingChapterAllowance(seriesId: string, allowance: number | null, chapterCountAtCancelling?: number) {
    return this.commands.setEndingChapterAllowance(seriesId, allowance, chapterCountAtCancelling)
  }

  updatePublicationType(seriesId: string, publicationType: PublicationType) {
    return this.commands.updatePublicationType(seriesId, publicationType)
  }

  updateSerializationSlot(
    seriesId: string,
    slot: { magazine: string; startIssueNumber: number; publicationType: string }
  ) {
    return this.commands.updateSerializationSlot(seriesId, slot)
  }

  setFranchiseConsentStatus(seriesId: string, status: FranchiseConsentStatus) {
    return this.commands.setFranchiseConsentStatus(seriesId, status)
  }

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
    return this.commands.setCompletionProposal(seriesId, proposal)
  }
}
