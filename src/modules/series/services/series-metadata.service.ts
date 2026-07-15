import { Injectable } from '@nestjs/common'
import { AuditEntityType, NotificationType, SeriesStatus } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import {
  SeriesAccessDeniedException,
  SeriesMetadataConflictException,
  SeriesNotEditableException,
  SeriesNotFoundException
} from '../errors/series.errors'
import { UpdateSeriesMetadataBodyType } from '../schemas/series-schemas'
import { toSeriesRes } from '../series.mapper'
import { SeriesMessages } from '../series.messages'
import { SeriesRepository } from '../series.repo'
import { SERIES_METADATA_TERMINAL_STATUSES } from '../series.constant'
import { SeriesCaller } from './series-query.service'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

// Series đã kết thúc là hồ sơ lịch sử đóng, không còn được sửa nội dung trình bày.
const TERMINAL_STATUSES = new Set<SeriesStatus>(SERIES_METADATA_TERMINAL_STATUSES)

/** Spec 14 §2 — cập nhật allowlist metadata của Series, không ghi state machine. */
@Injectable()
export class SeriesMetadataService {
  constructor(
    private readonly seriesRepository: SeriesRepository,
    private readonly auditService: AuditService,
    private readonly notificationService: NotificationService
  ) {}

  async update(caller: SeriesCaller, seriesId: string, body: UpdateSeriesMetadataBodyType) {
    if (!OBJECT_ID_RE.test(seriesId)) throw SeriesNotFoundException

    const series = await this.seriesRepository.findById(seriesId)
    if (!series) throw SeriesNotFoundException

    const isOwner = series.mangakaId === caller.userId
    const isAssignedEditor = series.editorId === caller.userId
    if (!isOwner && !isAssignedEditor) throw SeriesAccessDeniedException
    if (TERMINAL_STATUSES.has(series.status)) throw SeriesNotEditableException

    const result = await this.seriesRepository.updateSeriesMetadata(seriesId, body, {
      authorization: { kind: isOwner ? 'OWNER' : 'EDITOR', userId: caller.userId },
      blockedStatuses: SERIES_METADATA_TERMINAL_STATUSES
    })
    if (result.outcome === 'GUARD_MISMATCH') {
      if (TERMINAL_STATUSES.has(result.series.status)) throw SeriesNotEditableException
      const remainsAuthorized = result.series.mangakaId === caller.userId || result.series.editorId === caller.userId
      if (!remainsAuthorized) throw SeriesAccessDeniedException
      throw SeriesNotEditableException
    }
    if (result.outcome === 'RETRY_EXHAUSTED') throw SeriesMetadataConflictException
    if (result.outcome === 'UNCHANGED') return toSeriesRes(result.series)
    const changedFields = result.changedFields

    // Side-effects run only after the main write commits; both collaborators are best-effort.
    await this.auditService.record({
      actorId: caller.userId,
      entityType: AuditEntityType.SERIES,
      entityId: seriesId,
      action: 'METADATA_UPDATED',
      reason: changedFields.join(',')
    })

    const counterpartId = result.series.mangakaId === caller.userId ? result.series.editorId : result.series.mangakaId
    if (counterpartId) {
      await this.notificationService.notifySafe({
        recipientId: counterpartId,
        type: NotificationType.SYSTEM,
        referenceId: seriesId,
        referenceType: 'SERIES_METADATA_UPDATED',
        content: SeriesMessages.notification.seriesMetadataUpdated(changedFields.join(', '))
      })
    }

    return toSeriesRes(result.series)
  }
}
