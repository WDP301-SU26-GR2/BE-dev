import { Injectable } from '@nestjs/common'
import { NameStatus, NotificationType, ProposalStatus, SeriesStatus } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import {
  InvalidProposalStateException,
  NotSeriesOwnerException,
  ParentSeriesNotFoundException,
  ProposalNotEditableException,
  SeriesNotFoundException
} from '../errors/series.errors'
import { toNameRes, toSeriesRes } from '../series.mapper'
import { SeriesRepository } from '../series.repo'
import { CreateProposalBodyType, UpdateProposalBodyType } from '../schemas/series-schemas'
import { SeriesStateService } from './series-state.service'
import { SeriesMessages } from '../series.messages'

@Injectable()
export class SeriesProposalService {
  constructor(
    private readonly seriesRepository: SeriesRepository,
    private readonly seriesStateService: SeriesStateService,
    private readonly notificationService: NotificationService
  ) {}

  async createProposal(mangakaId: string, body: CreateProposalBodyType) {
    if (body.parentSeriesId) {
      const parent = await this.seriesRepository.findById(body.parentSeriesId)
      if (!parent) throw ParentSeriesNotFoundException
      // B1-INTEGRATION: khi có Contract module, nếu parent contractType=REVENUE_SHARE & Mangaka gốc còn quyền
      // -> yêu cầu Mangaka gốc đồng ý trước khi cho proposal franchise tiếp tục.
    }
    const { series, name } = await this.seriesRepository.createProposalSeries(mangakaId, body)
    return { series: toSeriesRes(series), name: toNameRes(name) }
  }

  async updateProposal(mangakaId: string, seriesId: string, body: UpdateProposalBodyType) {
    const series = await this.requireOwner(seriesId, mangakaId)
    if (series.status !== SeriesStatus.DRAFT) throw ProposalNotEditableException
    const updated = await this.seriesRepository.updateProposalDraft(seriesId, series.proposal?.nameId ?? null, body)
    return toSeriesRes(updated)
  }

  async submit(mangakaId: string, seriesId: string) {
    const series = await this.requireOwner(seriesId, mangakaId)
    if (series.status !== SeriesStatus.DRAFT) throw InvalidProposalStateException
    const nameId = series.proposal?.nameId
    if (!nameId) throw InvalidProposalStateException

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
    await this.assignEditorIfUnset(series, editorId)
    const updated = await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.PROPOSAL_REVISION)
    await this.notifyMangaka(series.mangakaId, seriesId, SeriesMessages.notification.proposalRevision(reason))
    return toSeriesRes(updated)
  }

  async resubmit(mangakaId: string, seriesId: string) {
    const series = await this.requireOwner(seriesId, mangakaId)
    if (series.proposal?.status !== ProposalStatus.PROPOSAL_REVISION) throw InvalidProposalStateException
    const updated = await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.PROPOSAL_REVIEW)
    if (series.editorId)
      await this.notifyMangaka(series.editorId, seriesId, SeriesMessages.notification.proposalResubmitted)
    return toSeriesRes(updated)
  }

  async approve(editorId: string, seriesId: string) {
    const series = await this.requireSeries(seriesId)
    if (series.status !== SeriesStatus.IN_REVIEW || series.proposal?.status !== ProposalStatus.PROPOSAL_REVIEW) {
      throw InvalidProposalStateException
    }
    await this.assignEditorIfUnset(series, editorId)
    await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.PROPOSAL_APPROVED)
    const advanced = await this.seriesStateService.tryAdvanceToReadyToPitch(seriesId, editorId)
    await this.notifyMangaka(series.mangakaId, seriesId, SeriesMessages.notification.proposalApproved)
    return toSeriesRes(advanced)
  }

  async reject(editorId: string, seriesId: string, reason: string) {
    const series = await this.requireSeries(seriesId)
    if (series.status !== SeriesStatus.IN_REVIEW) throw InvalidProposalStateException
    await this.assignEditorIfUnset(series, editorId)
    await this.seriesRepository.updateProposalStatus(seriesId, ProposalStatus.REJECTED)
    const updated = await this.seriesStateService.transition(seriesId, SeriesStatus.ABANDONED, {
      changedBy: editorId,
      reason
    })
    await this.notifyMangaka(series.mangakaId, seriesId, SeriesMessages.notification.proposalRejected(reason))
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

  private async assignEditorIfUnset(series: { id: string; editorId: string | null }, editorId: string) {
    if (!series.editorId) await this.seriesRepository.setEditor(series.id, editorId)
  }

  private async notifyMangaka(recipientId: string, seriesId: string, content: string) {
    await this.notificationService.notify({
      recipientId,
      type: NotificationType.SYSTEM,
      referenceId: seriesId,
      referenceType: 'SERIES',
      content
    })
  }
}
