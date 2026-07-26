import { Injectable } from '@nestjs/common'
import { FranchiseConsentStatus, ProposalStatus, RevisionTargetType, SeriesStatus } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { NameApprovalService } from 'src/modules/name/services/name-approval.service'
import { RevisionService } from 'src/modules/revision/revision.service'
import {
  FranchiseConsentRequiredException,
  InvalidProposalStateException,
  ProposalNotDeletableException,
  ProposalNotEditableException,
  SeriesNotFoundException
} from '../errors/series.errors'
import { toSeriesRes } from '../series.mapper'
import { SeriesRepository } from '../series.repo'
import { CreateProposalBodyType, UpdateProposalBodyType } from '../schemas/series-schemas'
import { SeriesStateService } from './series-state.service'
import { SeriesMessages } from '../series.messages'
import { requireAssignedEditor } from './series-editor.guard'
import { SeriesProposalAccessService } from './series-proposal-access.service'

@Injectable()
export class SeriesProposalService {
  constructor(
    private readonly seriesRepository: SeriesRepository,
    private readonly nameApprovalService: NameApprovalService,
    private readonly seriesStateService: SeriesStateService,
    private readonly revisionService: RevisionService,
    private readonly accessService: SeriesProposalAccessService
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
    const nameId = series.proposal?.nameId
    if (!nameId) throw InvalidProposalStateException
    if (
      series.franchiseConsentStatus === FranchiseConsentStatus.PENDING ||
      series.franchiseConsentStatus === FranchiseConsentStatus.REJECTED
    ) {
      throw FranchiseConsentRequiredException
    }

    // Single-writer: Series.status chỉ đổi qua SeriesStateService.
    // Cập nhật proposal + Name trước, transition (ghi audit) sau cùng.
    await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.PROPOSAL_REVIEW)
    const name = await this.nameApprovalService.submitProposalName(nameId)
    const updated = await this.seriesStateService.transition(seriesId, SeriesStatus.IN_REVIEW, { changedBy: mangakaId })
    return { series: toSeriesRes(updated), name }
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
    const advanced = await this.seriesStateService.tryAdvanceToReadyToPitch(seriesId, editorId)
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
    const series = await this.accessService.requireOwner(seriesId, mangakaId)
    // Transition TRƯỚC (validate state machine — PITCHED trở đi bị 409), proposal status ghi SAU.
    // Đảo thứ tự sẽ để lại proposal=WITHDRAWN trên series đang PITCHED khi transition bị chặn.
    await this.seriesStateService.transition(seriesId, SeriesStatus.WITHDRAWN, {
      changedBy: mangakaId,
      reason
    })
    const updated = await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.WITHDRAWN)
    if (series.status === SeriesStatus.REJECTED && series.editorId) {
      await this.accessService.notify(
        series.editorId,
        seriesId,
        'SERIES_WITHDRAWN_AFTER_REJECT',
        SeriesMessages.notification.seriesWithdrawnAfterReject
      )
    }
    return toSeriesRes(updated)
  }

  async reopen(mangakaId: string, seriesId: string) {
    const series = await this.accessService.requireOwner(seriesId, mangakaId)
    await this.seriesStateService.transition(seriesId, SeriesStatus.DRAFT, { changedBy: mangakaId })
    const updated = await this.seriesRepository.reopenSeriesToDraft(seriesId)
    const nameId = series.proposal?.nameId
    if (nameId) await this.nameApprovalService.resetProposalNameToDraft(nameId)
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
    await this.seriesRepository.deleteSeriesWithNames(seriesId)
    return { message: SeriesMessages.response.proposalDeleted }
  }

  async franchiseConsent(seriesId: string, callerId: string, approve: boolean) {
    return this.accessService.franchiseConsent(seriesId, callerId, approve)
  }
}
