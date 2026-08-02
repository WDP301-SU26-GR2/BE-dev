import { Injectable } from '@nestjs/common'
import { FranchiseConsentStatus, NotificationType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { NotificationService } from 'src/modules/notification/notification.service'
import { SeriesMessages } from '../series.messages'
import { SeriesRepository } from '../series.repo'
import { toSeriesRes } from '../series.mapper'
import { CreateProposalBodyType } from '../schemas/series-schemas'
import {
  NotFranchiseConsentTargetException,
  NotOriginalMangakaException,
  NotSeriesOwnerException,
  ParentSeriesNotFoundException,
  SeriesNotFoundException
} from '../errors/series.errors'

@Injectable()
export class SeriesProposalAccessService {
  constructor(
    private readonly repository: SeriesRepository,
    private readonly notificationService: NotificationService
  ) {}

  async createProposal(mangakaId: string, body: CreateProposalBodyType) {
    let franchiseConsentStatus: FranchiseConsentStatus | undefined
    let parentMangakaId: string | null = null
    if (body.parentSeriesId) {
      const parent = await this.repository.findById(body.parentSeriesId)
      if (!parent) throw ParentSeriesNotFoundException
      const contractType = await this.repository.findExecutedContractType(body.parentSeriesId)
      if (contractType === 'REVENUE_SHARE' && parent.mangakaId !== mangakaId) {
        franchiseConsentStatus = FranchiseConsentStatus.PENDING
        parentMangakaId = parent.mangakaId
      }
    }
    const series = await this.repository.createProposalSeries(mangakaId, body, franchiseConsentStatus)
    if (parentMangakaId) {
      await this.notificationService.notifySafe({
        recipientId: parentMangakaId,
        type: NotificationType.SYSTEM,
        referenceId: series.id,
        referenceType: 'FRANCHISE_CONSENT_REQUESTED',
        content: SeriesMessages.notification.franchiseConsentRequested
      })
    }
    return toSeriesRes(series)
  }

  async franchiseConsent(seriesId: string, callerId: string, approve: boolean) {
    if (!isObjectId(seriesId)) throw SeriesNotFoundException
    const derivative = await this.repository.findById(seriesId)
    if (!derivative) throw SeriesNotFoundException
    if (derivative.franchiseConsentStatus == null || !derivative.parentSeriesId) {
      throw NotFranchiseConsentTargetException
    }
    const parent = await this.repository.findById(derivative.parentSeriesId)
    if (!parent || parent.mangakaId !== callerId) throw NotOriginalMangakaException
    const status = approve ? FranchiseConsentStatus.APPROVED : FranchiseConsentStatus.REJECTED
    const updated = await this.repository.setFranchiseConsentStatus(seriesId, status)
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

  async requireSeries(seriesId: string) {
    const series = await this.repository.findById(seriesId)
    if (!series) throw SeriesNotFoundException
    return series
  }

  async requireOwner(seriesId: string, mangakaId: string) {
    const series = await this.requireSeries(seriesId)
    if (series.mangakaId !== mangakaId) throw NotSeriesOwnerException
    return series
  }

  async notify(recipientId: string, seriesId: string, referenceType: string, content: string) {
    await this.notificationService.notifySafe({
      recipientId,
      type: NotificationType.SYSTEM,
      referenceId: seriesId,
      referenceType,
      content
    })
  }
}
