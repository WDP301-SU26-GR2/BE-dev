import { Injectable } from '@nestjs/common'
import { NameKind, NameStatus, NotificationType, SeriesStatus } from '@prisma/client'
import { AppConfigService } from 'src/modules/app-config/app-config.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { DomainEvent } from 'src/core/events/domain-events'
import { DomainEventBus } from 'src/core/events/domain-event-bus.service'
import { RoleName } from 'src/core/security/constants/role.constant'
import { NameRepo } from './name.repo'
import { NameMessages } from './name.messages'
import { toNameRes } from './name.mapper'
import { requireAssignedEditor } from './name-editor.guard'
import { AddNamePageBodyType, CreateChapterNameBodyType, UpdateNamePagesBodyType } from './schemas/name-schemas'
import {
  ChapterNameAlreadyExistsException,
  ChapterNotDraftForNameException,
  ChapterNotFoundException,
  InvalidNameStateException,
  NameNotFoundException,
  NotSeriesOwnerException,
  SeriesAccessDeniedException,
  SeriesNotFoundException,
  SeriesNotSerializedException
} from './errors/name.errors'

// AGENTS §10: id rác (không 24-hex) đưa thẳng vào Prisma `where: { id }` → ném P2023 → 500.
// Guard trước khi query để trả 404 sạch.
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

const N = NameMessages.notification

// Fix-1 G-1: đồng bộ với chapter-creation — ending phase vẫn tạo được chapter-Name.
// LẶP const cục bộ (không import chéo module chapter — vertical slice); 2 danh sách phải giống hệt.
const CHAPTER_CREATABLE_STATUSES: SeriesStatus[] = [
  SeriesStatus.SERIALIZED,
  SeriesStatus.CANCELLING,
  SeriesStatus.COMPLETING
]

export type NameCaller = { userId: string; roleName: string }

@Injectable()
export class NameService {
  constructor(
    private readonly nameRepo: NameRepo,
    private readonly eventBus: DomainEventBus,
    private readonly notificationService: NotificationService,
    private readonly appConfigService: AppConfigService
  ) {}

  // ── Chapter-Name create (Flow 2, MỚI) ──────────────────────────────────────
  async createChapterName(mangakaId: string, chapterId: string, body: CreateChapterNameBodyType) {
    if (!OBJECT_ID_RE.test(chapterId)) throw ChapterNotFoundException
    const chapter = await this.nameRepo.findChapterForNameGuard(chapterId)
    if (!chapter) throw ChapterNotFoundException
    if (chapter.series?.mangakaId !== mangakaId) throw NotSeriesOwnerException
    if (chapter.status !== 'DRAFT') throw ChapterNotDraftForNameException
    if (
      chapter.series?.status !== SeriesStatus.SERIALIZED &&
      !CHAPTER_CREATABLE_STATUSES.includes(chapter.series.status)
    )
      throw SeriesNotSerializedException
    if (chapter.nameId) throw ChapterNameAlreadyExistsException
    const created = await this.nameRepo.createChapterNameForChapter({
      chapterId,
      seriesId: chapter.seriesId,
      chapterNumber: chapter.chapterNumber,
      namePages: body.namePages
    })
    return toNameRes(created)
  }

  // ── Lifecycle (MOVE từ series NameService — guard status inline như cũ) ────
  async requestRevision(editorId: string, seriesId: string, nameId: string, reason: string) {
    const { series, name } = await this.requireSeriesName(seriesId, nameId)
    requireAssignedEditor(series, editorId)
    if (name.status !== NameStatus.SUBMITTED && name.status !== NameStatus.IN_REVIEW) {
      throw InvalidNameStateException
    }
    const updated = await this.nameRepo.updateNameStatus(nameId, { status: NameStatus.REVISION })
    await this.notify(series.mangakaId, seriesId, 'NAME_REVISION_REQUESTED', N.nameRevision(reason))
    return toNameRes(updated)
  }

  async resubmit(mangakaId: string, seriesId: string, nameId: string) {
    const { series, name } = await this.requireOwnerName(seriesId, mangakaId, nameId)
    if (name.status !== NameStatus.REVISION) throw InvalidNameStateException
    const updated = await this.nameRepo.updateNameStatus(nameId, {
      status: NameStatus.IN_REVIEW,
      version: name.version + 1
    })
    const config = await this.appConfigService.get()
    if (updated.version >= config.nameMaxReviewRounds && series.editorId) {
      await this.notificationService.notifySafe({
        recipientId: series.editorId,
        type: NotificationType.REVIEW,
        referenceId: nameId,
        referenceType: 'NAME_LOOP_WARNING',
        content: N.nameLoopWarning(updated.version)
      })
    }
    return toNameRes(updated)
  }

  async approve(editorId: string, seriesId: string, nameId: string) {
    const { series, name } = await this.requireSeriesName(seriesId, nameId)
    requireAssignedEditor(series, editorId)
    if (name.status !== NameStatus.SUBMITTED && name.status !== NameStatus.IN_REVIEW) {
      throw InvalidNameStateException
    }
    const updated = await this.nameRepo.updateNameStatus(nameId, { status: NameStatus.APPROVED })
    // Cắt coupling Name → Series: emit NameApproved SAU commit. Series listener sẽ advance
    // READY_TO_PITCH nếu kind=PROPOSAL; kind=CHAPTER → no-op (xem spec §6).
    this.eventBus.emit(DomainEvent.NameApproved, { seriesId, nameId, kind: updated.kind })
    await this.notify(series.mangakaId, seriesId, 'NAME_APPROVED', N.nameApproved)
    return toNameRes(updated)
  }

  async updatePages(mangakaId: string, seriesId: string, nameId: string, body: UpdateNamePagesBodyType) {
    const { name } = await this.requireOwnerName(seriesId, mangakaId, nameId)
    if (name.status !== NameStatus.DRAFT && name.status !== NameStatus.REVISION) {
      throw InvalidNameStateException
    }
    const updated = await this.nameRepo.updateNamePages(nameId, body.pages)
    return toNameRes(updated)
  }

  async addPage(mangakaId: string, seriesId: string, nameId: string, page: AddNamePageBodyType) {
    const { name } = await this.requireOwnerName(seriesId, mangakaId, nameId)
    if (name.status !== NameStatus.DRAFT && name.status !== NameStatus.REVISION) {
      throw InvalidNameStateException
    }
    const updated = await this.nameRepo.appendNamePage(nameId, page)
    return toNameRes(updated)
  }

  // ── Reads (MOVE từ series-query.service, scope theo role) ─────────────────
  async listNames(caller: NameCaller, seriesId: string, kind?: NameKind) {
    const series = await this.requireSeriesScope(caller, seriesId)
    const names = kind
      ? await this.nameRepo.findNamesBySeriesIdAndKind(series.id, kind)
      : await this.nameRepo.findNamesBySeriesId(series.id)
    return { items: names.map(toNameRes) }
  }

  async getName(caller: NameCaller, seriesId: string, nameId: string) {
    await this.requireSeriesScope(caller, seriesId)
    if (!OBJECT_ID_RE.test(nameId)) throw NameNotFoundException
    const name = await this.nameRepo.findNameById(nameId)
    if (!name || name.seriesId !== seriesId) throw NameNotFoundException
    return toNameRes(name)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private async requireSeriesName(seriesId: string, nameId: string) {
    if (!OBJECT_ID_RE.test(seriesId)) throw SeriesNotFoundException
    const series = await this.nameRepo.findSeriesForGuard(seriesId)
    if (!series) throw SeriesNotFoundException
    if (!OBJECT_ID_RE.test(nameId)) throw NameNotFoundException
    const name = await this.nameRepo.findNameById(nameId)
    if (!name || name.seriesId !== seriesId) throw NameNotFoundException
    return { series, name }
  }

  private async requireOwnerName(seriesId: string, mangakaId: string, nameId: string) {
    const { series, name } = await this.requireSeriesName(seriesId, nameId)
    if (series.mangakaId !== mangakaId) throw NotSeriesOwnerException
    return { series, name }
  }

  private async requireSeriesScope(caller: NameCaller, seriesId: string) {
    if (!OBJECT_ID_RE.test(seriesId)) throw SeriesNotFoundException
    const series = await this.nameRepo.findSeriesForGuard(seriesId)
    if (!series) throw SeriesNotFoundException
    const { userId, roleName } = caller
    if (roleName === RoleName.SUPER_ADMIN || roleName === RoleName.BOARD_MEMBER) return series
    if (roleName === RoleName.EDITOR && series.editorId === userId) return series
    if (roleName === RoleName.MANGAKA && series.mangakaId === userId) return series
    throw SeriesAccessDeniedException
  }

  private async notify(recipientId: string, seriesId: string, referenceType: string, content: string) {
    await this.notificationService.notifySafe({
      recipientId,
      type: NotificationType.SYSTEM,
      referenceId: seriesId,
      referenceType,
      content
    })
  }
}
