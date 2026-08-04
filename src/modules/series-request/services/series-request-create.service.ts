import { Injectable } from '@nestjs/common'
import { SeriesRequestStatus, SeriesRequestType } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { SeriesLifecycleNotificationService } from 'src/modules/series/services/series-lifecycle-notification.service'
import { SeriesContextPort } from '../ports/series-context.port'
import {
  OpenSeriesRequestExistsException,
  SeriesRequestAccessDeniedException,
  SeriesRequestNotAllowedException,
  SeriesRequestNotFoundException
} from '../errors/series-request.errors'
import { CreateSeriesRequestBodyType } from '../schemas/series-request-schemas'
import { ALLOWED_SERIES_STATUS_FOR_REQUEST } from '../series-request.constant'
import { SeriesRequestMessages } from '../series-request.messages'
import { SeriesRequestRepository } from '../series-request.repo'
import { SeriesRequestStateService } from './series-request-state.service'

const CREATED_CONTENT: Record<SeriesRequestType, (reason: string) => string> = {
  WITHDRAW: SeriesRequestMessages.notification.createdWithdraw,
  HIATUS: SeriesRequestMessages.notification.createdHiatus,
  COMPLETION: SeriesRequestMessages.notification.createdCompletion
}

@Injectable()
export class SeriesRequestCreateService {
  constructor(
    private readonly repository: SeriesRequestRepository,
    private readonly seriesContext: SeriesContextPort,
    private readonly stateService: SeriesRequestStateService,
    private readonly notifications: SeriesLifecycleNotificationService
  ) {}

  async create(mangakaId: string, body: CreateSeriesRequestBodyType) {
    const series = await this.seriesContext.findById(body.seriesId)
    if (!series) throw SeriesRequestNotFoundException
    if (series.mangakaId !== mangakaId) throw SeriesRequestAccessDeniedException

    const allowed = ALLOWED_SERIES_STATUS_FOR_REQUEST[body.requestType]
    if (!allowed.includes(series.status)) throw SeriesRequestNotAllowedException

    const open = await this.repository.findOpenBySeries(body.seriesId)
    if (open) throw OpenSeriesRequestExistsException

    const created = await this.repository.create({
      seriesId: body.seriesId,
      requestedBy: mangakaId,
      requestType: body.requestType,
      reason: body.reason,
      expectedReturnDate: body.expectedReturnDate ? new Date(body.expectedReturnDate) : null,
      proposedEndingChapters: body.proposedEndingChapters ?? null
    })

    // Side-effect SAU khi ghi DB (AGENTS §8). Series chưa có editor thì không có ai để báo.
    if (series.editorId) {
      await this.notifications.notifyOne(
        series.editorId,
        body.seriesId,
        'SERIES_REQUEST_CREATED',
        CREATED_CONTENT[body.requestType](body.reason)
      )
    }
    return created
  }

  async cancel(mangakaId: string, requestId: string) {
    if (!isObjectId(requestId)) throw SeriesRequestNotFoundException
    const request = await this.repository.findById(requestId)
    if (!request) throw SeriesRequestNotFoundException
    if (request.requestedBy !== mangakaId) throw SeriesRequestAccessDeniedException

    const updated = await this.stateService.transition(requestId, SeriesRequestStatus.CANCELLED, { by: mangakaId })

    const series = await this.seriesContext.findById(request.seriesId)
    if (series?.editorId) {
      await this.notifications.notifyOne(
        series.editorId,
        request.seriesId,
        'SERIES_REQUEST_CANCELLED',
        SeriesRequestMessages.notification.cancelled
      )
    }
    return updated
  }
}
