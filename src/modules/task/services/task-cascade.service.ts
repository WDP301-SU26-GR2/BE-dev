import { Injectable, Logger } from '@nestjs/common'
import { Task, TaskStatus } from '@prisma/client'
import { PageStateService } from 'src/modules/chapter/services/page-state.service'
import { ManuscriptStateService } from 'src/modules/chapter/services/manuscript-state.service'
import { TaskRepository } from '../task.repo'
import { TASK_REACHED_SUBMITTED } from '../task.constant'

@Injectable()
export class TaskCascadeService {
  private readonly logger = new Logger(TaskCascadeService.name)

  constructor(
    private readonly taskRepository: TaskRepository,
    private readonly pageStateService: PageStateService,
    private readonly manuscriptStateService: ManuscriptStateService
  ) {}

  // Gọi SAU khi submit commit. Best-effort: transition invalid → log, KHÔNG throw.
  async fireOnSubmitted(task: Task, changedBy: string): Promise<void> {
    const page = await this.taskRepository.findPageWithOwner(task.pageId)
    if (!page) return
    if (page.chapter.hold) {
      this.logger.debug(`Cascade skipped (chapter on hold) page=${task.pageId}`)
      return
    }

    // Marker 2: mọi task của page đạt SUBMITTED + page IN_PROGRESS → COMPOSITE_READY
    const pageStatuses = (await this.taskRepository.findTaskStatusesByPage(task.pageId)).filter(
      (status) => status !== TaskStatus.CANCELLED
    )
    const allPageSubmitted = pageStatuses.length > 0 && pageStatuses.every((s) => TASK_REACHED_SUBMITTED.includes(s))
    if (allPageSubmitted && page.status === 'IN_PROGRESS') {
      try {
        await this.pageStateService.transition(task.pageId, 'COMPOSITE_READY')
      } catch (error) {
        this.logger.debug(`Cascade page COMPOSITE_READY skipped ${task.pageId}: ${String(error)}`)
      }
    }

    // Marker 1: mọi task của chapter đạt SUBMITTED + manuscript IN_PRODUCTION → COMPOSITE_REVIEW
    const chapterStatuses = (await this.taskRepository.findTaskStatusesByChapter(page.chapterId)).filter(
      (status) => status !== TaskStatus.CANCELLED
    )
    const allChapterSubmitted =
      chapterStatuses.length > 0 && chapterStatuses.every((s) => TASK_REACHED_SUBMITTED.includes(s))
    if (allChapterSubmitted) {
      const manuscript = await this.taskRepository.findManuscriptStatusByChapter(page.chapterId)
      if (manuscript?.status === 'IN_PRODUCTION') {
        try {
          await this.manuscriptStateService.transition(page.chapterId, 'COMPOSITE_REVIEW', { changedBy })
        } catch (error) {
          this.logger.debug(`Cascade manuscript COMPOSITE_REVIEW skipped ${page.chapterId}: ${String(error)}`)
        }
      }
    }
  }
}
