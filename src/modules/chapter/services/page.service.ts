import { Injectable } from '@nestjs/common'
import { AuditEntityType, ManuscriptStatus, NameStatus, NotificationType, TaskStatus } from '@prisma/client'
import {
  ChapterAccessDeniedException,
  ChapterNameNotApprovedException,
  ChapterNotFoundException,
  ChapterOnHoldException,
  DuplicatePageNumberException,
  NotSeriesOwnerException,
  PageHasApprovedTasksException,
  PageNotEditableException,
  PageNotFoundException
} from '../errors/chapter.errors'
import { RoleName } from 'src/core/security/constants/role.constant'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { StudioAssignmentService } from 'src/modules/studio/services/studio-assignment.service'
import { ChapterRepository } from '../chapter.repo'
import { PAGE_EDITABLE_STATUSES } from '../chapter.constant'
import { ChapterMessages } from '../chapter.messages'
import { CreatePageBodyType, DeletePagesBulkBodyType, UpdatePageBodyType } from '../schemas/chapter-schemas'
import { ManuscriptStateService } from './manuscript-state.service'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class PageService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly manuscriptStateService: ManuscriptStateService,
    private readonly studioAssignmentService: StudioAssignmentService,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService
  ) {}

  // Cascade Page → Region → Task (mẫu PA-03 xoá Region): audit + notify SAU khi DB commit.
  private async notifyRemovedTasks(tasks: Array<{ id: string; assistantId: string | null }>) {
    for (const task of tasks) {
      if (!task.assistantId) continue
      await this.notificationService.notifySafe({
        recipientId: task.assistantId,
        type: NotificationType.TASK,
        referenceId: task.id,
        referenceType: 'TASK_CANCELLED',
        content: ChapterMessages.notification.taskRemovedWithPage
      })
    }
  }

  private async requireOwner(userId: string, chapterId: string) {
    const chapter = await this.chapterRepository.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series || series.mangakaId !== userId) throw NotSeriesOwnerException
    if (chapter.hold) throw ChapterOnHoldException
    return chapter
  }

  // A-CHP-03: tạo Page. Page đầu tiên (Manuscript=DRAFT) → DRAFT→IN_PRODUCTION (Mangaka bắt đầu vẽ).
  // Gate (Task 3, Spec 10): Name phải APPROVED mới được upload page.
  async createPage(userId: string, chapterId: string, body: CreatePageBodyType) {
    const chapter = await this.requireOwner(userId, chapterId)
    if (!chapter.nameId) throw ChapterNameNotApprovedException
    const nameStatus = await this.chapterRepository.findNameStatus(chapter.nameId)
    if (nameStatus !== NameStatus.APPROVED) throw ChapterNameNotApprovedException
    const page = await this.chapterRepository.createPage(chapterId, {
      pageNumber: body.pageNumber,
      originalFile: body.originalFile
    })
    const manuscript = await this.chapterRepository.findManuscriptByChapterId(chapterId)
    if (manuscript?.status === ManuscriptStatus.DRAFT) {
      await this.manuscriptStateService.transition(chapterId, ManuscriptStatus.IN_PRODUCTION, { changedBy: userId })
    }
    return page
  }

  async updatePage(userId: string, pageId: string, body: UpdatePageBodyType) {
    const page = await this.chapterRepository.findPageById(pageId)
    if (!page) throw PageNotFoundException
    await this.requireOwner(userId, page.chapterId)
    if (!PAGE_EDITABLE_STATUSES.includes(page.status)) throw PageNotEditableException

    // Partial-update (AGENTS §10): omit/null = giữ nguyên.
    // KHÔNG cho sửa originalFile: đó là NGUỒN cho AI segment + Assistant workspace.
    // Muốn thay bản gốc → xoá trang rồi upload lại (DELETE /pages/:pageId).
    const data: { compositeFile?: string; pageNumber?: number } = {}
    if (body.compositeFile != null) data.compositeFile = body.compositeFile
    if (body.pageNumber != null) {
      const taken = await this.chapterRepository.findPageByChapterAndNumber(page.chapterId, body.pageNumber)
      if (taken && taken.id !== pageId) throw DuplicatePageNumberException
      data.pageNumber = body.pageNumber
    }
    if (Object.keys(data).length > 0) await this.chapterRepository.updatePage(pageId, data)
    return this.chapterRepository.findPageById(pageId)
  }

  async deletePage(userId: string, pageId: string) {
    if (!OBJECT_ID_RE.test(pageId)) throw PageNotFoundException
    const page = await this.chapterRepository.findPageById(pageId)
    if (!page) throw PageNotFoundException
    await this.requireOwner(userId, page.chapterId)
    if (!PAGE_EDITABLE_STATUSES.includes(page.status)) throw PageNotEditableException

    const tasks = await this.chapterRepository.findTasksByPage(pageId)
    // Đồng bộ PA-03 (xoá Region): không cho xoá mất công trợ lý đã được duyệt.
    if (tasks.some((task) => task.status === TaskStatus.APPROVED)) throw PageHasApprovedTasksException
    const { deletedRegions, deletedTasks } = await this.chapterRepository.deletePageCascade(pageId)

    await this.auditService.record({
      actorId: userId,
      entityType: AuditEntityType.PAGE,
      entityId: pageId,
      action: 'PAGE_DELETE_CASCADE',
      reason: `deleted regions: ${deletedRegions}, deleted tasks: ${deletedTasks}`
    })
    await this.notifyRemovedTasks(tasks)

    return { pageId, deletedRegions, deletedTasks }
  }

  // All-or-nothing: validate TOÀN BỘ page trước, chỉ xoá khi mọi page hợp lệ.
  async deletePagesBulk(userId: string, chapterId: string, body: DeletePagesBulkBodyType) {
    await this.requireOwner(userId, chapterId)

    const pages = await this.chapterRepository.findPagesByIds(body.pageIds)
    if (pages.length !== body.pageIds.length) throw PageNotFoundException
    if (pages.some((page) => page.chapterId !== chapterId)) throw PageNotFoundException
    if (pages.some((page) => !PAGE_EDITABLE_STATUSES.includes(page.status))) throw PageNotEditableException

    const tasks = await this.chapterRepository.findTasksByPages(body.pageIds)
    if (tasks.some((task) => task.status === TaskStatus.APPROVED)) throw PageHasApprovedTasksException
    const { deletedRegions, deletedTasks } = await this.chapterRepository.deletePagesCascade(body.pageIds)

    await this.auditService.record({
      actorId: userId,
      entityType: AuditEntityType.CHAPTER,
      entityId: chapterId,
      action: 'PAGE_BULK_DELETE_CASCADE',
      reason: `deleted pages: ${body.pageIds.join(',')}`
    })
    await this.notifyRemovedTasks(tasks)

    return { deletedPages: pages.length, deletedRegions, deletedTasks }
  }

  // BR-AUTH-00: RBAC + scoping theo sở hữu/phân công. Assistant đọc được trang của studio
  // mình đang cộng tác (cùng gate BR-ASSIST-01 dùng cho giao task).
  async listPages(userId: string, roleName: string, chapterId: string) {
    if (!OBJECT_ID_RE.test(chapterId)) throw ChapterNotFoundException
    const chapter = await this.chapterRepository.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(chapter.seriesId)
    if (!series) throw ChapterNotFoundException

    if (roleName === RoleName.MANGAKA) {
      if (series.mangakaId !== userId) throw ChapterAccessDeniedException
    } else if (roleName === RoleName.EDITOR) {
      if (series.editorId !== userId) throw ChapterAccessDeniedException
    } else if (roleName === RoleName.ASSISTANT) {
      const active = await this.studioAssignmentService.findActiveForPair(series.mangakaId, userId)
      if (!active) throw ChapterAccessDeniedException
    }
    // BOARD_MEMBER / SUPER_ADMIN: quyền đọc toàn hệ thống (giám sát)

    return this.chapterRepository.findPagesByChapterId(chapterId)
  }
}
