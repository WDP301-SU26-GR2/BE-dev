import { Injectable } from '@nestjs/common'
import { FranchiseConsentStatus, NameStatus, NotificationType, ProposalStatus, SeriesStatus } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import {
  FranchiseConsentRequiredException,
  InvalidProposalStateException,
  NotFranchiseConsentTargetException,
  NotOriginalMangakaException,
  NotSeriesOwnerException,
  ParentSeriesNotFoundException,
  ProposalNotDeletableException,
  ProposalNotEditableException,
  SeriesNotFoundException
} from '../errors/series.errors'
import { toNameRes, toSeriesRes } from '../series.mapper'
import { SeriesRepository } from '../series.repo'
import { CreateProposalBodyType, UpdateProposalBodyType } from '../schemas/series-schemas'
import { SeriesStateService } from './series-state.service'
import { SeriesMessages } from '../series.messages'
import { requireAssignedEditor } from './series-editor.guard'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class SeriesProposalService {
  constructor(
    private readonly seriesRepository: SeriesRepository,
    private readonly seriesStateService: SeriesStateService,
    private readonly notificationService: NotificationService
  ) {}

  async createProposal(mangakaId: string, body: CreateProposalBodyType) {
    let franchiseConsentStatus: FranchiseConsentStatus | undefined
    let notifyParentMangakaId: string | null = null
    if (body.parentSeriesId) {
      const parent = await this.seriesRepository.findById(body.parentSeriesId)
      if (!parent) throw ParentSeriesNotFoundException
      const parentContractType = await this.seriesRepository.findExecutedContractType(body.parentSeriesId)
      if (parentContractType === 'REVENUE_SHARE' && parent.mangakaId !== mangakaId) {
        franchiseConsentStatus = FranchiseConsentStatus.PENDING
        notifyParentMangakaId = parent.mangakaId
      }
    }
    const { series, name } = await this.seriesRepository.createProposalSeries(mangakaId, body, franchiseConsentStatus)
    if (notifyParentMangakaId) {
      await this.notificationService.notifySafe({
        recipientId: notifyParentMangakaId,
        type: NotificationType.SYSTEM,
        referenceId: series.id,
        referenceType: 'FRANCHISE_CONSENT_REQUESTED',
        content: SeriesMessages.notification.franchiseConsentRequested
      })
    }
    return { series: toSeriesRes(series), name: toNameRes(name) }
  }

  async updateProposal(mangakaId: string, seriesId: string, body: UpdateProposalBodyType) {
    const series = await this.requireOwner(seriesId, mangakaId)
    const editable =
      series.status === SeriesStatus.DRAFT || series.proposal?.status === ProposalStatus.PROPOSAL_REVISION
    if (!editable) throw ProposalNotEditableException
    const updated = await this.seriesRepository.updateProposalContent(seriesId, body)
    return toSeriesRes(updated)
  }

  async submit(mangakaId: string, seriesId: string) {
    const series = await this.requireOwner(seriesId, mangakaId)
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
    const name = await this.seriesRepository.updateNameStatus(nameId, {
      status: NameStatus.SUBMITTED,
      submittedAt: new Date()
    })
    const updated = await this.seriesStateService.transition(seriesId, SeriesStatus.IN_REVIEW, { changedBy: mangakaId })
    return { series: toSeriesRes(updated), name: toNameRes(name) }
  }

  async requestRevision(editorId: string, seriesId: string, reason: string) {
    const series = await this.requireSeries(seriesId)
    if (series.status !== SeriesStatus.IN_REVIEW || series.proposal?.status !== ProposalStatus.PROPOSAL_REVIEW) {
      throw InvalidProposalStateException
    }
    requireAssignedEditor(series, editorId)
    if (!series.reviewStartedAt) await this.seriesRepository.markReviewStarted(seriesId)
    const updated = await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.PROPOSAL_REVISION)
    await this.notifyMangaka(
      series.mangakaId,
      seriesId,
      'PROPOSAL_REVISION_REQUESTED',
      SeriesMessages.notification.proposalRevision(reason)
    )
    return toSeriesRes(updated)
  }

  async resubmit(mangakaId: string, seriesId: string) {
    const series = await this.requireOwner(seriesId, mangakaId)
    if (series.proposal?.status !== ProposalStatus.PROPOSAL_REVISION) throw InvalidProposalStateException
    const updated = await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.PROPOSAL_REVIEW)
    if (series.editorId)
      await this.notifyMangaka(
        series.editorId,
        seriesId,
        'PROPOSAL_RESUBMITTED',
        SeriesMessages.notification.proposalResubmitted
      )
    return toSeriesRes(updated)
  }

  async approve(editorId: string, seriesId: string) {
    const series = await this.requireSeries(seriesId)
    if (series.status !== SeriesStatus.IN_REVIEW || series.proposal?.status !== ProposalStatus.PROPOSAL_REVIEW) {
      throw InvalidProposalStateException
    }
    requireAssignedEditor(series, editorId)
    if (!series.reviewStartedAt) await this.seriesRepository.markReviewStarted(seriesId)
    await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.PROPOSAL_APPROVED)
    const advanced = await this.seriesStateService.tryAdvanceToReadyToPitch(seriesId, editorId)
    await this.notifyMangaka(
      series.mangakaId,
      seriesId,
      'PROPOSAL_APPROVED',
      SeriesMessages.notification.proposalApproved
    )
    return toSeriesRes(advanced)
  }

  async reject(editorId: string, seriesId: string, reason: string) {
    const series = await this.requireSeries(seriesId)
    if (series.status !== SeriesStatus.IN_REVIEW) throw InvalidProposalStateException
    requireAssignedEditor(series, editorId)
    if (!series.reviewStartedAt) await this.seriesRepository.markReviewStarted(seriesId)
    await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.REJECTED)
    const updated = await this.seriesStateService.transition(seriesId, SeriesStatus.ABANDONED, {
      changedBy: editorId,
      reason
    })
    await this.notifyMangaka(
      series.mangakaId,
      seriesId,
      'PROPOSAL_REJECTED',
      SeriesMessages.notification.proposalRejected(reason)
    )
    return toSeriesRes(updated)
  }

  async withdraw(mangakaId: string, seriesId: string, reason: string) {
    await this.requireOwner(seriesId, mangakaId)
    await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.WITHDRAWN)
    const updated = await this.seriesStateService.transition(seriesId, SeriesStatus.WITHDRAWN, {
      changedBy: mangakaId,
      reason
    })
    return toSeriesRes(updated)
  }

  async deleteProposal(mangakaId: string, seriesId: string) {
    if (!OBJECT_ID_RE.test(seriesId)) throw SeriesNotFoundException
    const series = await this.requireOwner(seriesId, mangakaId)
    if (series.status !== SeriesStatus.DRAFT) throw ProposalNotDeletableException
    await this.seriesRepository.deleteSeriesWithNames(seriesId)
    return { message: SeriesMessages.response.proposalDeleted }
  }

  // A-SER-06: Mangaka gốc đồng ý/từ chối series phái sinh. REJECTED chỉ block submit (creator tự withdraw).
  async franchiseConsent(seriesId: string, callerId: string, approve: boolean) {
    if (!OBJECT_ID_RE.test(seriesId)) throw SeriesNotFoundException
    const derivative = await this.seriesRepository.findById(seriesId)
    if (!derivative) throw SeriesNotFoundException
    if (derivative.franchiseConsentStatus == null || !derivative.parentSeriesId) {
      throw NotFranchiseConsentTargetException
    }
    const parent = await this.seriesRepository.findById(derivative.parentSeriesId)
    if (!parent || parent.mangakaId !== callerId) throw NotOriginalMangakaException
    const status = approve ? FranchiseConsentStatus.APPROVED : FranchiseConsentStatus.REJECTED
    const updated = await this.seriesRepository.setFranchiseConsentStatus(seriesId, status)
    await this.notificationService.notifySafe({
      recipientId: derivative.mangakaId,
      type: NotificationType.SYSTEM,
      referenceId: seriesId,
      referenceType: approve ? 'FRANCHISE_CONSENT_APPROVED' : 'FRANCHISE_CONSENT_REJECTED',
      content: approve
        ? SeriesMessages.notification.franchiseConsentApproved
        : SeriesMessages.notification.franchiseConsentRejected
    })
    return toSeriesRes(updated)
  }

  private async requireSeries(seriesId: string) {
    const series = await this.seriesRepository.findById(seriesId)
    if (!series) throw SeriesNotFoundException
    return series
  }

  private async requireOwner(seriesId: string, mangakaId: string) {
    const series = await this.requireSeries(seriesId)
    if (series.mangakaId !== mangakaId) throw NotSeriesOwnerException
    return series
  }

  private async notifyMangaka(recipientId: string, seriesId: string, referenceType: string, content: string) {
    await this.notificationService.notifySafe({
      recipientId,
      type: NotificationType.SYSTEM,
      referenceId: seriesId,
      referenceType,
      content
    })
  }
}
