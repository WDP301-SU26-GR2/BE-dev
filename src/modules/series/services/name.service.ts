import { Injectable } from '@nestjs/common'
import { NameStatus, NotificationType } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import { InvalidNameStateException, NotSeriesOwnerException, SeriesNotFoundException } from '../errors/series.errors'
import { toNameRes } from '../series.mapper'
import { SeriesRepository } from '../series.repo'
import { SeriesStateService } from './series-state.service'
import { SeriesMessages } from '../series.messages'
import { requireAssignedEditor } from './series-editor.guard'

@Injectable()
export class NameService {
  constructor(
    private readonly seriesRepository: SeriesRepository,
    private readonly seriesStateService: SeriesStateService,
    private readonly notificationService: NotificationService
  ) {}

  async requestRevision(editorId: string, seriesId: string, nameId: string, reason: string) {
    const { series, name } = await this.requireSeriesName(seriesId, nameId)
    requireAssignedEditor(series, editorId)
    if (name.status !== NameStatus.SUBMITTED && name.status !== NameStatus.IN_REVIEW) throw InvalidNameStateException
    const updated = await this.seriesRepository.updateNameStatus(nameId, { status: NameStatus.REVISION })
    await this.notify(series.mangakaId, seriesId, SeriesMessages.notification.nameRevision(reason))
    return toNameRes(updated)
  }

  async resubmit(mangakaId: string, seriesId: string, nameId: string) {
    const { name } = await this.requireOwnerName(seriesId, mangakaId, nameId)
    if (name.status !== NameStatus.REVISION) throw InvalidNameStateException
    const updated = await this.seriesRepository.updateNameStatus(nameId, {
      status: NameStatus.IN_REVIEW,
      version: name.version + 1
    })
    return toNameRes(updated)
  }

  async approve(editorId: string, seriesId: string, nameId: string) {
    const { series, name } = await this.requireSeriesName(seriesId, nameId)
    requireAssignedEditor(series, editorId)
    if (name.status !== NameStatus.SUBMITTED && name.status !== NameStatus.IN_REVIEW) throw InvalidNameStateException
    const updated = await this.seriesRepository.updateNameStatus(nameId, { status: NameStatus.APPROVED })
    await this.seriesStateService.tryAdvanceToReadyToPitch(seriesId, editorId)
    await this.notify(series.mangakaId, seriesId, SeriesMessages.notification.nameApproved)
    return toNameRes(updated)
  }

  async updatePages(
    mangakaId: string,
    seriesId: string,
    nameId: string,
    pages: { pageNumber: number; fileUrl: string }[]
  ) {
    const { name } = await this.requireOwnerName(seriesId, mangakaId, nameId)
    if (name.status !== NameStatus.DRAFT && name.status !== NameStatus.REVISION) throw InvalidNameStateException
    const updated = await this.seriesRepository.updateNamePages(nameId, pages)
    return toNameRes(updated)
  }

  async addPage(mangakaId: string, seriesId: string, nameId: string, page: { pageNumber: number; fileUrl: string }) {
    const { name } = await this.requireOwnerName(seriesId, mangakaId, nameId)
    if (name.status !== NameStatus.DRAFT && name.status !== NameStatus.REVISION) throw InvalidNameStateException
    const updated = await this.seriesRepository.appendNamePage(nameId, page)
    return toNameRes(updated)
  }

  private async requireSeriesName(seriesId: string, nameId: string) {
    const series = await this.seriesRepository.findById(seriesId)
    if (!series) throw SeriesNotFoundException
    const name = await this.seriesRepository.findNameById(nameId)
    if (!name || name.seriesId !== seriesId) throw SeriesNotFoundException
    return { series, name }
  }

  private async requireOwnerName(seriesId: string, mangakaId: string, nameId: string) {
    const { series, name } = await this.requireSeriesName(seriesId, nameId)
    if (series.mangakaId !== mangakaId) throw NotSeriesOwnerException
    return { series, name }
  }

  private async notify(recipientId: string, seriesId: string, content: string) {
    await this.notificationService.notify({
      recipientId,
      type: NotificationType.SYSTEM,
      referenceId: seriesId,
      referenceType: 'NAME',
      content
    })
  }
}
