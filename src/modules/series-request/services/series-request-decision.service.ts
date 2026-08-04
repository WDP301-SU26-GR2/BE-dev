import { Injectable } from '@nestjs/common'
import { SeriesRequestStatus, SeriesRequestType, SeriesStatus } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { SeriesLifecycleNotificationService } from 'src/modules/series/services/series-lifecycle-notification.service'
import { SeriesLifecycleService } from 'src/modules/series/services/series-lifecycle.service'
import { SeriesStateService } from 'src/modules/series/services/series-state.service'
import { SeriesContextPort } from '../ports/series-context.port'
import {
  SeriesRequestAccessDeniedException,
  SeriesRequestNotAllowedException,
  SeriesRequestNotFoundException
} from '../errors/series-request.errors'
import { AcceptSeriesRequestBodyType, RejectSeriesRequestBodyType } from '../schemas/series-request-schemas'
import { ALLOWED_SERIES_STATUS_FOR_REQUEST } from '../series-request.constant'
import { SeriesRequestMessages } from '../series-request.messages'
import { SeriesRequestRepository } from '../series-request.repo'
import { SeriesRequestStateService } from './series-request-state.service'

const ACCEPTED_CONTENT: Record<SeriesRequestType, string> = {
  WITHDRAW: SeriesRequestMessages.notification.acceptedWithdraw,
  HIATUS: SeriesRequestMessages.notification.acceptedHiatus,
  COMPLETION: SeriesRequestMessages.notification.acceptedCompletion
}

@Injectable()
export class SeriesRequestDecisionService {
  constructor(
    private readonly repository: SeriesRequestRepository,
    private readonly seriesContext: SeriesContextPort,
    private readonly stateService: SeriesRequestStateService,
    private readonly seriesStateService: SeriesStateService,
    private readonly lifecycleService: SeriesLifecycleService,
    private readonly notifications: SeriesLifecycleNotificationService
  ) {}

  // Guard dùng chung: id hợp lệ → request tồn tại & PENDING → đúng biên tập viên phụ trách →
  // trạng thái bộ truyện VẪN hợp lệ (kiểm lại, chống TOCTOU).
  private async loadForDecision(editorId: string, requestId: string) {
    if (!isObjectId(requestId)) throw SeriesRequestNotFoundException
    const request = await this.repository.findById(requestId)
    if (!request) throw SeriesRequestNotFoundException
    const series = await this.seriesContext.findById(request.seriesId)
    if (!series) throw SeriesRequestNotFoundException
    if (series.editorId !== editorId) throw SeriesRequestAccessDeniedException
    return { request, series }
  }

  async accept(editorId: string, requestId: string, body: AcceptSeriesRequestBodyType) {
    const { request, series } = await this.loadForDecision(editorId, requestId)
    const allowed = ALLOWED_SERIES_STATUS_FOR_REQUEST[request.requestType]
    if (!allowed.includes(series.status)) throw SeriesRequestNotAllowedException

    // Đánh dấu request TRƯỚC — state service chặn nếu request không còn PENDING.
    const updated = await this.stateService.transition(requestId, SeriesRequestStatus.ACCEPTED, {
      by: editorId,
      reason: body.note ?? null,
      extra: { decidedBy: editorId, decidedAt: new Date(), decisionNote: body.note ?? null }
    })

    if (request.requestType === SeriesRequestType.WITHDRAW) {
      await this.seriesStateService.transition(request.seriesId, SeriesStatus.WITHDRAWN, {
        changedBy: editorId,
        reason: request.reason
      })
    } else if (request.requestType === SeriesRequestType.HIATUS) {
      // Tái dùng nguyên logic hiatus (cascade + event + notify) — KHÔNG nhân bản luật.
      const returnDate = body.expectedReturnDate ?? request.expectedReturnDate?.toISOString()
      await this.lifecycleService.hiatus(request.seriesId, editorId, request.reason, returnDate)
    }
    // COMPLETION: KHÔNG đổi trạng thái. Biên tập viên tự mở phiên Hội đồng (BoardDecision COMPLETION).

    await this.notifications.notifyOne(
      request.requestedBy,
      request.seriesId,
      'SERIES_REQUEST_ACCEPTED',
      ACCEPTED_CONTENT[request.requestType]
    )
    return updated
  }

  async reject(editorId: string, requestId: string, body: RejectSeriesRequestBodyType) {
    const { request } = await this.loadForDecision(editorId, requestId)
    const updated = await this.stateService.transition(requestId, SeriesRequestStatus.REJECTED, {
      by: editorId,
      reason: body.reason,
      extra: { decidedBy: editorId, decidedAt: new Date(), rejectReason: body.reason }
    })
    await this.notifications.notifyOne(
      request.requestedBy,
      request.seriesId,
      'SERIES_REQUEST_REJECTED',
      SeriesRequestMessages.notification.rejected(body.reason)
    )
    return updated
  }
}
