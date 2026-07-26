import { Injectable, Logger, Optional } from '@nestjs/common'
import { AuditEntityType, NotificationType, TaskStatus } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { StorageService } from 'src/infrastructure/storage/storage.service'
import { AuditService } from 'src/modules/audit/audit.service'
import { NotificationService } from 'src/modules/notification/notification.service'
import { PAGE_EDITABLE_STATUSES } from '../chapter.constant'
import { ChapterMessages } from '../chapter.messages'
import { ChapterRepository } from '../chapter.repo'
import {
  PageHasApprovedTasksException,
  PageNotEditableException,
  PageNotFoundException
} from '../errors/chapter.errors'
import { ProductionPageSetLockedException } from '../errors/production-stage.errors'
import { ProductionStageRepository } from '../production-stage.repo'
import { DeletePagesBulkBodyType } from '../schemas/chapter-schemas'
import { ChapterPageAccessService } from './chapter-page-access.service'

@Injectable()
export class PageCleanupService {
  private readonly logger = new Logger(PageCleanupService.name)

  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly notificationService: NotificationService,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
    private readonly accessService: ChapterPageAccessService,
    @Optional() private readonly productionStageRepository?: ProductionStageRepository
  ) {}

  private async assertPageSetEditable(chapterId: string) {
    if (!this.productionStageRepository) return
    const firstStage = (await this.productionStageRepository.findByChapter(chapterId))[0]
    if (firstStage && firstStage.status !== 'ACTIVE') throw ProductionPageSetLockedException
  }

  private async deleteObjectsSafe(keys: Array<string | null | undefined>) {
    for (const key of keys) {
      if (!key) continue
      try {
        await this.storageService.deleteObject(key)
      } catch (err) {
        this.logger.warn(`R2 deleteObject failed for key ${key}: ${String(err)}`)
      }
    }
  }

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

  async deletePage(userId: string, pageId: string) {
    if (!isObjectId(pageId)) throw PageNotFoundException
    const page = await this.chapterRepository.findPageById(pageId)
    if (!page) throw PageNotFoundException
    await this.accessService.requireOwner(userId, page.chapterId)
    await this.assertPageSetEditable(page.chapterId)
    if (!PAGE_EDITABLE_STATUSES.includes(page.status)) throw PageNotEditableException
    const tasks = await this.chapterRepository.findTasksByPage(pageId)
    if (tasks.some((task) => task.status === TaskStatus.APPROVED)) throw PageHasApprovedTasksException
    const result = await this.chapterRepository.deletePageCascade(page.chapterId, pageId)
    await this.auditService.record({
      actorId: userId,
      entityType: AuditEntityType.PAGE,
      entityId: pageId,
      action: 'PAGE_DELETE_CASCADE',
      reason: `deleted regions: ${result.deletedRegions}, deleted tasks: ${result.deletedTasks}`
    })
    await this.notifyRemovedTasks(tasks)
    await this.deleteObjectsSafe([page.originalFile, page.compositeFile])
    return { pageId, ...result }
  }

  async deletePagesBulk(userId: string, chapterId: string, body: DeletePagesBulkBodyType) {
    await this.accessService.requireOwner(userId, chapterId)
    await this.assertPageSetEditable(chapterId)
    const pages = await this.chapterRepository.findPagesByIds(body.pageIds)
    if (pages.length !== body.pageIds.length || pages.some((page) => page.chapterId !== chapterId))
      throw PageNotFoundException
    if (pages.some((page) => !PAGE_EDITABLE_STATUSES.includes(page.status))) throw PageNotEditableException
    const tasks = await this.chapterRepository.findTasksByPages(body.pageIds)
    if (tasks.some((task) => task.status === TaskStatus.APPROVED)) throw PageHasApprovedTasksException
    const result = await this.chapterRepository.deletePagesCascade(chapterId, body.pageIds)
    await this.auditService.record({
      actorId: userId,
      entityType: AuditEntityType.CHAPTER,
      entityId: chapterId,
      action: 'PAGE_BULK_DELETE_CASCADE',
      reason: `deleted pages: ${body.pageIds.join(',')}`
    })
    await this.notifyRemovedTasks(tasks)
    await this.deleteObjectsSafe(pages.flatMap((page) => [page.originalFile, page.compositeFile]))
    return { deletedPages: pages.length, ...result }
  }
}
