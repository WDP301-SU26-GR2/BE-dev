import { Injectable } from '@nestjs/common'
import { FranchiseConsentStatus, ProposalStatus, RevisionTargetType, SeriesStatus } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RevisionService } from 'src/modules/revision/revision.service'
import {
  FranchiseConsentRequiredException,
  InvalidProposalStateException,
  MangakaProfileRequiredException,
  ProposalNotDeletableException,
  ProposalNotEditableException,
  SeriesNotFoundException
} from '../errors/series.errors'
import { MangakaProfileGatePort } from '../ports/mangaka-profile-gate.port'
import { toSeriesRes } from '../series.mapper'
import { SeriesRepository } from '../series.repo'
import { CreateProposalBodyType, UpdateProposalBodyType } from '../schemas/series-schemas'
import { SeriesStateService } from './series-state.service'
import { SeriesMessages } from '../series.messages'
import { requireAssignedEditor } from './series-editor.guard'
import { SeriesProposalAccessService } from './series-proposal-access.service'
import { SeriesWithdrawService } from './series-withdraw.service'

@Injectable()
export class SeriesProposalService {
  constructor(
    private readonly seriesRepository: SeriesRepository,
    private readonly seriesStateService: SeriesStateService,
    private readonly revisionService: RevisionService,
    private readonly accessService: SeriesProposalAccessService,
    private readonly withdrawService: SeriesWithdrawService,
    private readonly mangakaProfileGate: MangakaProfileGatePort
  ) {}

  async createProposal(mangakaId: string, body: CreateProposalBodyType) {
    return this.accessService.createProposal(mangakaId, body)
  }
  async updateProposal(mangakaId: string, seriesId: string, body: UpdateProposalBodyType) {
    const series = await this.accessService.requireOwner(seriesId, mangakaId)
    const editable =
      series.status === SeriesStatus.DRAFT || series.proposal?.status === ProposalStatus.PROPOSAL_REVISION
    if (!editable) throw ProposalNotEditableException
    const updated = await this.seriesRepository.updateProposalContent(seriesId, body)
    return toSeriesRes(updated)
  }
  async submit(mangakaId: string, seriesId: string) {
    const series = await this.accessService.requireOwner(seriesId, mangakaId)
    if (series.status !== SeriesStatus.DRAFT) throw InvalidProposalStateException
    if (
      series.franchiseConsentStatus === FranchiseConsentStatus.PENDING ||
      series.franchiseConsentStatus === FranchiseConsentStatus.REJECTED
    ) {
      throw FranchiseConsentRequiredException
    }

    // Quality gate: Mangaka phải có hồ sơ (track record) để Editor/Board xét khi review/pitch (Requiment §2.3b/§2.4a).
    // Chỉ chặn lần submit đầu (DRAFT→IN_REVIEW); resubmit/reopen không chặn.
    if (!(await this.mangakaProfileGate.hasProfile(mangakaId))) throw MangakaProfileRequiredException

    // Single-writer: Series.status chỉ đổi qua SeriesStateService.
    await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.PROPOSAL_REVIEW)
    const updated = await this.seriesStateService.transition(seriesId, SeriesStatus.IN_REVIEW, { changedBy: mangakaId })
    return toSeriesRes(updated)
  }
  async requestRevision(editorId: string, seriesId: string, reason: string) {
    const series = await this.accessService.requireSeries(seriesId)
    if (series.status !== SeriesStatus.IN_REVIEW || series.proposal?.status !== ProposalStatus.PROPOSAL_REVIEW) {
      throw InvalidProposalStateException
    }
    requireAssignedEditor(series, editorId)
    if (!series.reviewStartedAt) await this.seriesRepository.markReviewStarted(seriesId)
    const updated = await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.PROPOSAL_REVISION)

    const { round } = await this.revisionService.openSafe({
      targetType: RevisionTargetType.PROPOSAL,
      targetId: seriesId,
      seriesId,
      reason,
      requestedBy: editorId,
      recipientId: series.mangakaId
    })

    await this.accessService.notify(
      series.mangakaId,
      seriesId,
      'PROPOSAL_REVISION_REQUESTED',
      SeriesMessages.notification.proposalRevision(round, reason)
    )
    return toSeriesRes(updated)
  }

  async resubmit(mangakaId: string, seriesId: string) {
    const series = await this.accessService.requireOwner(seriesId, mangakaId)
    if (series.proposal?.status !== ProposalStatus.PROPOSAL_REVISION) throw InvalidProposalStateException
    const updated = await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.PROPOSAL_REVIEW)
    if (series.editorId) {
      const round = await this.revisionService.currentRound(RevisionTargetType.PROPOSAL, seriesId)
      await this.accessService.notify(
        series.editorId,
        seriesId,
        'PROPOSAL_RESUBMITTED',
        SeriesMessages.notification.proposalResubmitted(round)
      )
    }
    return toSeriesRes(updated)
  }

  async approve(editorId: string, seriesId: string) {
    const series = await this.accessService.requireSeries(seriesId)
    if (series.status !== SeriesStatus.IN_REVIEW || series.proposal?.status !== ProposalStatus.PROPOSAL_REVIEW) {
      throw InvalidProposalStateException
    }
    requireAssignedEditor(series, editorId)
    if (!series.reviewStartedAt) await this.seriesRepository.markReviewStarted(seriesId)
    await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.PROPOSAL_APPROVED)
    // Spec 28: vòng duyệt gộp — duyệt proposal duy nhất → READY_TO_PITCH ngay, không có gate thứ hai.
    const advanced = await this.seriesStateService.transition(seriesId, SeriesStatus.READY_TO_PITCH, {
      changedBy: editorId
    })
    await this.accessService.notify(
      series.mangakaId,
      seriesId,
      'PROPOSAL_APPROVED',
      SeriesMessages.notification.proposalApproved
    )
    return toSeriesRes(advanced)
  }

  async reject(editorId: string, seriesId: string, reason: string) {
    const series = await this.accessService.requireSeries(seriesId)
    if (series.status !== SeriesStatus.IN_REVIEW && series.status !== SeriesStatus.REJECTED) {
      throw InvalidProposalStateException
    }
    requireAssignedEditor(series, editorId)
    if (series.status === SeriesStatus.IN_REVIEW && !series.reviewStartedAt) {
      await this.seriesRepository.markReviewStarted(seriesId)
    }
    await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.REJECTED)
    const updated = await this.seriesStateService.transition(seriesId, SeriesStatus.ABANDONED, {
      changedBy: editorId,
      reason
    })
    await this.accessService.notify(
      series.mangakaId,
      seriesId,
      'PROPOSAL_REJECTED',
      SeriesMessages.notification.proposalRejected(reason)
    )
    return toSeriesRes(updated)
  }

  async withdraw(mangakaId: string, seriesId: string, reason: string) {
    return this.withdrawService.withdraw(mangakaId, seriesId, reason)
  }

  async reopen(mangakaId: string, seriesId: string) {
    await this.accessService.requireOwner(seriesId, mangakaId)
    await this.seriesStateService.transition(seriesId, SeriesStatus.DRAFT, { changedBy: mangakaId })
    // Reset editor/review metadata and proposal exactly once; no Storyboard row participates.
    const updated = await this.seriesRepository.reopenSeriesToDraft(seriesId)
    return toSeriesRes(updated)
  }

  async reopenForReview(editorId: string, seriesId: string, reason?: string) {
    const series = await this.accessService.requireSeries(seriesId)
    requireAssignedEditor(series, editorId)
    await this.seriesStateService.transition(seriesId, SeriesStatus.IN_REVIEW, { changedBy: editorId, reason })
    const updated = await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.PROPOSAL_REVISION)
    await this.accessService.notify(
      series.mangakaId,
      seriesId,
      'SERIES_REOPENED_FOR_REVIEW',
      SeriesMessages.notification.seriesReopenedForReview
    )
    return toSeriesRes(updated)
  }

  async deleteProposal(mangakaId: string, seriesId: string) {
    if (!isObjectId(seriesId)) throw SeriesNotFoundException
    const series = await this.accessService.requireOwner(seriesId, mangakaId)
    if (series.status !== SeriesStatus.DRAFT) throw ProposalNotDeletableException
    await this.seriesRepository.deleteProposalSeries(seriesId)
    return { message: SeriesMessages.response.proposalDeleted }
  }

  async franchiseConsent(seriesId: string, callerId: string, approve: boolean) {
    return this.accessService.franchiseConsent(seriesId, callerId, approve)
  }
}
