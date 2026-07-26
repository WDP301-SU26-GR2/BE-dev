import { FranchiseConsentStatus, ProposalStatus, PublicationType, SeriesStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { SeriesProposalRepository } from './series-proposal.repository'

export class SeriesCommandRepository {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly proposalRepository: SeriesProposalRepository
  ) {}

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

  async reopenSeriesToDraft(seriesId: string) {
    await this.prismaService.series.update({
      where: { id: seriesId },
      data: { editorId: { unset: true }, reviewStartedAt: { unset: true } }
    })
    return this.proposalRepository.updateProposalStatus(seriesId, ProposalStatus.DRAFT)
  }

  async markReviewStarted(seriesId: string): Promise<void> {
    await this.prismaService.series.updateMany({
      where: { id: seriesId, reviewStartedAt: { isSet: false } },
      data: { reviewStartedAt: new Date() }
    })
  }

  updateStatusWithHistory(
    seriesId: string,
    entry: { fromStatus: SeriesStatus; toStatus: SeriesStatus; changedBy: string | null; reason?: string }
  ) {
    return this.prismaService.series.update({
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

  async setHiatusStartedAt(seriesId: string, date: Date | null) {
    await this.prismaService.series.update({ where: { id: seriesId }, data: { hiatusStartedAt: date } })
  }

  async setEndingChapterAllowance(seriesId: string, allowance: number | null, chapterCountAtCancelling?: number) {
    await this.prismaService.series.update({
      where: { id: seriesId },
      data: {
        endingChapterAllowance: allowance,
        ...(chapterCountAtCancelling !== undefined ? { chapterCountAtCancelling } : {})
      }
    })
  }

  async updatePublicationType(seriesId: string, publicationType: PublicationType) {
    await this.prismaService.series.update({ where: { id: seriesId }, data: { publicationType } })
  }

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

  setFranchiseConsentStatus(seriesId: string, status: FranchiseConsentStatus) {
    return this.prismaService.series.update({
      where: { id: seriesId },
      data: { franchiseConsentStatus: status }
    })
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
    return this.prismaService.series.update({
      where: { id: seriesId },
      data: {
        completionProposal: {
          set: { ...proposal, proposedEndingChapters: proposal.proposedEndingChapters ?? null }
        }
      }
    })
  }
}
