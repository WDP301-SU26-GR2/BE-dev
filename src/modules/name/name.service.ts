import { Injectable } from '@nestjs/common'
import { NameKind, NameStatus, NotificationType, RevisionTargetType, SeriesStatus } from '@prisma/client'
import { AppConfigService } from 'src/modules/app-config/app-config.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { RevisionService } from 'src/modules/revision/revision.service'
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
  NameNotDeletableException,
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
    private readonly appConfigService: AppConfigService,
    private readonly revisionService: RevisionService
  ) {}

  // ── Chapter-Name create (Flow 2, MỚI) ──────────────────────────────────────
  async createChapterName(mangakaId: string, chapterId: string, body: CreateChapterNameBodyType) {
    if (!OBJECT_ID_RE.test(chapterId)) throw ChapterNotFoundException
    const chapter = await this.nameRepo.findChapterForNameGuard(chapterId)
    if (!chapter) throw ChapterNotFoundException
    if (chapter.series?.mangakaId !== mangakaId) throw NotSeriesOwnerException
    if (chapter.status !== 'DRAFT') throw ChapterNotDraftForNameException
    // Fix-1 G-1 (Requiment Flow 5): ending phase vẫn tạo được chapter-Name.
    // LẶP const cục bộ (không import chéo module chapter — vertical slice); 2 danh sách phải giống hệt.
    if (!chapter.series?.status || !CHAPTER_CREATABLE_STATUSES.includes(chapter.series.status))
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

  // ── Lifecycle ────────────────────────────────────────────────────────────
  // Public series-scoped = PROPOSAL only (Spec 12 tách vai).
  // Public chapter-scoped (chapter*) = CHAPTER only, resolve seriesId từ chapter.
  // Thân nghiệp vụ nằm ở do* — DUY NHẤT một bản, không nhân đôi state machine.

  async requestRevision(editorId: string, seriesId: string, nameId: string, reason: string) {
    return this.doRequestRevision(editorId, seriesId, nameId, reason, { kind: NameKind.PROPOSAL })
  }

  private async doRequestRevision(
    editorId: string,
    seriesId: string,
    nameId: string,
    reason: string,
    opts: { kind: NameKind; chapterId?: string }
  ) {
    const { series, name } = await this.requireSeriesName(seriesId, nameId, opts)
    requireAssignedEditor(series, editorId)
    const reopenable =
      opts.kind === NameKind.PROPOSAL && name.status === NameStatus.APPROVED && series.status === SeriesStatus.IN_REVIEW
    if (name.status !== NameStatus.SUBMITTED && name.status !== NameStatus.IN_REVIEW && !reopenable) {
      throw InvalidNameStateException
    }
    const updated = await this.nameRepo.updateNameStatus(nameId, { status: NameStatus.REVISION })

    const { round } = await this.revisionService.openSafe({
      targetType: RevisionTargetType.NAME,
      targetId: nameId,
      seriesId,
      reason,
      requestedBy: editorId,
      recipientId: series.mangakaId
    })

    // A revision belongs to one Name, so its notification idempotency key must use nameId.
    // The shared helper below intentionally remains series-scoped for the other lifecycle notifications.
    await this.notificationService.notifySafe({
      recipientId: series.mangakaId,
      type: NotificationType.SYSTEM,
      referenceId: nameId,
      referenceType: 'NAME_REVISION_REQUESTED',
      content: N.nameRevision(round, reason)
    })
    return toNameRes(updated)
  }

  async resubmit(mangakaId: string, seriesId: string, nameId: string) {
    return this.doResubmit(mangakaId, seriesId, nameId, { kind: NameKind.PROPOSAL })
  }

  private async doResubmit(
    mangakaId: string,
    seriesId: string,
    nameId: string,
    opts: { kind: NameKind; chapterId?: string }
  ) {
    const { series, name } = await this.requireOwnerName(seriesId, mangakaId, nameId, opts)
    if (name.status !== NameStatus.REVISION) throw InvalidNameStateException
    const updated = await this.nameRepo.updateNameStatus(nameId, {
      status: NameStatus.IN_REVIEW,
      version: name.version + 1
    })

    // Spec 14 §1.6.1: notify the assigned editor on every Name resubmission. Use nameId
    // as the reference because the existing helper is intentionally series-scoped.
    if (series.editorId) {
      const round = await this.revisionService.currentRound(RevisionTargetType.NAME, nameId)
      await this.notificationService.notifySafe({
        recipientId: series.editorId,
        type: NotificationType.REVIEW,
        referenceId: nameId,
        referenceType: 'NAME_RESUBMITTED',
        content: N.nameResubmitted(round)
      })
    }

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
    return this.doApprove(editorId, seriesId, nameId, { kind: NameKind.PROPOSAL })
  }

  async chapterApprove(editorId: string, chapterId: string, nameId: string) {
    const seriesId = await this.chapterSeriesId(chapterId)
    return this.doApprove(editorId, seriesId, nameId, { kind: NameKind.CHAPTER, chapterId })
  }

  private async doApprove(
    editorId: string,
    seriesId: string,
    nameId: string,
    opts: { kind: NameKind; chapterId?: string }
  ) {
    const { series, name } = await this.requireSeriesName(seriesId, nameId, opts)
    requireAssignedEditor(series, editorId)
    if (name.status !== NameStatus.SUBMITTED && name.status !== NameStatus.IN_REVIEW) {
      throw InvalidNameStateException
    }
    const updated = await this.nameRepo.updateNameStatus(nameId, { status: NameStatus.APPROVED })
    // Cắt coupling Name → Series: emit SAU commit. Series listener advance READY_TO_PITCH nếu
    // kind=PROPOSAL; kind=CHAPTER → no-op (gate page đọc trực tiếp Name.status).
    this.eventBus.emit(DomainEvent.NameApproved, { seriesId, nameId, kind: updated.kind })
    await this.notify(series.mangakaId, seriesId, 'NAME_APPROVED', N.nameApproved)
    return toNameRes(updated)
  }

  async updatePages(mangakaId: string, seriesId: string, nameId: string, body: UpdateNamePagesBodyType) {
    return this.doUpdatePages(mangakaId, seriesId, nameId, body, { kind: NameKind.PROPOSAL })
  }

  private async doUpdatePages(
    mangakaId: string,
    seriesId: string,
    nameId: string,
    body: UpdateNamePagesBodyType,
    opts: { kind: NameKind; chapterId?: string }
  ) {
    const { name } = await this.requireOwnerName(seriesId, mangakaId, nameId, opts)
    if (name.status !== NameStatus.DRAFT && name.status !== NameStatus.REVISION) {
      throw InvalidNameStateException
    }
    const updated = await this.nameRepo.updateNamePages(nameId, body.pages)
    return toNameRes(updated)
  }

  async addPage(mangakaId: string, seriesId: string, nameId: string, page: AddNamePageBodyType) {
    return this.doAddPage(mangakaId, seriesId, nameId, page, { kind: NameKind.PROPOSAL })
  }

  private async doAddPage(
    mangakaId: string,
    seriesId: string,
    nameId: string,
    page: AddNamePageBodyType,
    opts: { kind: NameKind; chapterId?: string }
  ) {
    const { name } = await this.requireOwnerName(seriesId, mangakaId, nameId, opts)
    if (name.status !== NameStatus.DRAFT && name.status !== NameStatus.REVISION) {
      throw InvalidNameStateException
    }
    const updated = await this.nameRepo.appendNamePage(nameId, page)
    return toNameRes(updated)
  }

  // ── Chapter-scoped delegates (Spec 12) ───────────────────────────────────
  // Delegate MỎNG: resolve seriesId từ chapter → gọi đúng core method. KHÔNG nhân đôi
  // business logic / state machine — chỉ nhân đôi tầng routing.
  async chapterRequestRevision(editorId: string, chapterId: string, nameId: string, reason: string) {
    const seriesId = await this.chapterSeriesId(chapterId)
    return this.doRequestRevision(editorId, seriesId, nameId, reason, { kind: NameKind.CHAPTER, chapterId })
  }

  async chapterResubmit(mangakaId: string, chapterId: string, nameId: string) {
    const seriesId = await this.chapterSeriesId(chapterId)
    return this.doResubmit(mangakaId, seriesId, nameId, { kind: NameKind.CHAPTER, chapterId })
  }

  // Option A: chapter-Name sinh ở DRAFT (sửa pages thoải mái) → Mangaka bấm nộp mới vào tầm Editor.
  // Đối xứng proposal-Name (POST /series/:id/submit). DRAFT→SUBMITTED, khác → 409.
  async chapterSubmit(mangakaId: string, chapterId: string, nameId: string) {
    const seriesId = await this.chapterSeriesId(chapterId)
    const { name } = await this.requireOwnerName(seriesId, mangakaId, nameId, { kind: NameKind.CHAPTER, chapterId })
    if (name.status !== NameStatus.DRAFT) throw InvalidNameStateException
    const updated = await this.nameRepo.updateNameStatus(nameId, {
      status: NameStatus.SUBMITTED,
      submittedAt: new Date()
    })
    return toNameRes(updated)
  }

  async chapterUpdatePages(mangakaId: string, chapterId: string, nameId: string, body: UpdateNamePagesBodyType) {
    const seriesId = await this.chapterSeriesId(chapterId)
    return this.doUpdatePages(mangakaId, seriesId, nameId, body, { kind: NameKind.CHAPTER, chapterId })
  }

  async chapterAddPage(mangakaId: string, chapterId: string, nameId: string, page: AddNamePageBodyType) {
    const seriesId = await this.chapterSeriesId(chapterId)
    return this.doAddPage(mangakaId, seriesId, nameId, page, { kind: NameKind.CHAPTER, chapterId })
  }

  async chapterListNames(caller: NameCaller, chapterId: string) {
    const seriesId = await this.chapterSeriesId(chapterId)
    await this.requireSeriesScope(caller, seriesId)
    const names = await this.nameRepo.findNamesByChapterId(chapterId)
    return { items: names.map(toNameRes) }
  }

  async chapterGetName(caller: NameCaller, chapterId: string, nameId: string) {
    const seriesId = await this.chapterSeriesId(chapterId)
    await this.requireSeriesScope(caller, seriesId)
    if (!OBJECT_ID_RE.test(nameId)) throw NameNotFoundException
    const name = await this.nameRepo.findNameById(nameId)
    if (!name || name.chapterId !== chapterId) throw NameNotFoundException
    return toNameRes(name)
  }

  /**
   * Mangaka vẽ Name hỏng → xoá để tạo lại (POST /chapters/:id/names bị chặn bởi ChapterNameAlreadyExists).
   * Chỉ khi chapter còn DRAFT và Name CHƯA APPROVED (Name APPROVED = checkpoint mở gate upload page).
   */
  async deleteChapterName(mangakaId: string, chapterId: string, nameId: string) {
    if (!OBJECT_ID_RE.test(chapterId)) throw ChapterNotFoundException
    const chapter = await this.nameRepo.findChapterForNameGuard(chapterId)
    if (!chapter) throw ChapterNotFoundException
    if (chapter.series?.mangakaId !== mangakaId) throw NotSeriesOwnerException

    if (!OBJECT_ID_RE.test(nameId)) throw NameNotFoundException
    const name = await this.nameRepo.findNameById(nameId)
    if (!name || name.chapterId !== chapterId) throw NameNotFoundException

    if (chapter.status !== 'DRAFT') throw NameNotDeletableException
    if (name.status === NameStatus.APPROVED) throw NameNotDeletableException

    await this.nameRepo.deleteChapterName(chapterId, nameId)
    return { message: NameMessages.response.chapterNameDeleted }
  }

  // ── Reads (MOVE từ series-query.service, scope theo role) ─────────────────
  // Series-scoped: CHỈ proposal-Name (Spec 12).
  async listNames(caller: NameCaller, seriesId: string, page?: { limit: number; offset: number }) {
    const series = await this.requireSeriesScope(caller, seriesId)
    const names = await this.nameRepo.findNamesBySeriesIdAndKind(series.id, NameKind.PROPOSAL, page)
    return { items: names.map(toNameRes) }
  }

  async getName(caller: NameCaller, seriesId: string, nameId: string) {
    await this.requireSeriesScope(caller, seriesId)
    if (!OBJECT_ID_RE.test(nameId)) throw NameNotFoundException
    const name = await this.nameRepo.findNameById(nameId)
    if (!name || name.seriesId !== seriesId || name.kind !== NameKind.PROPOSAL) throw NameNotFoundException
    return toNameRes(name)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private async requireSeriesName(seriesId: string, nameId: string, opts?: { kind?: NameKind; chapterId?: string }) {
    if (!OBJECT_ID_RE.test(seriesId)) throw SeriesNotFoundException
    const series = await this.nameRepo.findSeriesForGuard(seriesId)
    if (!series) throw SeriesNotFoundException
    if (!OBJECT_ID_RE.test(nameId)) throw NameNotFoundException
    const name = await this.nameRepo.findNameById(nameId)
    if (!name || name.seriesId !== seriesId) throw NameNotFoundException
    // Spec 12: tách vai. Route series-scoped chỉ phục vụ PROPOSAL; chapter-Name → 404 (không lộ tồn tại).
    if (opts?.kind && name.kind !== opts.kind) throw NameNotFoundException
    if (opts?.chapterId && name.chapterId !== opts.chapterId) throw NameNotFoundException
    return { series, name }
  }

  private async requireOwnerName(
    seriesId: string,
    mangakaId: string,
    nameId: string,
    opts?: { kind?: NameKind; chapterId?: string }
  ) {
    const { series, name } = await this.requireSeriesName(seriesId, nameId, opts)
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

  private async chapterSeriesId(chapterId: string): Promise<string> {
    if (!OBJECT_ID_RE.test(chapterId)) throw ChapterNotFoundException
    const chapter = await this.nameRepo.findChapterForNameGuard(chapterId)
    if (!chapter) throw ChapterNotFoundException
    return chapter.seriesId
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
