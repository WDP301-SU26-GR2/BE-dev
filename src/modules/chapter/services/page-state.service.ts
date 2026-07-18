import { Injectable } from '@nestjs/common'
import { AuditEntityType, PageStatus } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { PAGE_TRANSITIONS } from '../chapter.constant'
import { InvalidPageTransitionException, PageNotFoundException } from '../errors/chapter.errors'
import { ChapterRepository } from '../chapter.repo'

@Injectable()
export class PageStateService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly auditService: AuditService
  ) {}

  async transition(pageId: string, to: PageStatus, actorId?: string | null) {
    const result = await this.transitionUsing(this.chapterRepository, pageId, to)
    await this.recordAudits([result.event], actorId)
    return result.updated
  }

  private async transitionUsing(repository: ChapterRepository, pageId: string, to: PageStatus) {
    const page = await repository.findPageById(pageId)
    if (!page) throw PageNotFoundException
    const allowed = PAGE_TRANSITIONS[page.status] ?? []
    if (!allowed.includes(to)) throw InvalidPageTransitionException
    const updated = await repository.updatePageStatus(pageId, to)
    return { updated, event: { pageId, from: page.status, to } }
  }

  async transitionAllInChapter(
    chapterId: string,
    from: PageStatus[],
    to: PageStatus,
    actorId?: string | null
  ): Promise<number> {
    const events = await this.transitionAllUsing(this.chapterRepository, chapterId, from, to)
    await this.recordAudits(events, actorId)
    return events.length
  }

  /** Internal transaction seam used by ManuscriptStateService; audit is deliberately deferred until commit. */
  transitionAllUsing(
    repository: ChapterRepository,
    chapterId: string,
    from: PageStatus[],
    to: PageStatus
  ): Promise<{ pageId: string; from: PageStatus; to: PageStatus }[]> {
    return repository.findPagesByChapterId(chapterId).then(async (pages) => {
      const events: { pageId: string; from: PageStatus; to: PageStatus }[] = []
      for (const page of pages.filter((item) => from.includes(item.status))) {
        const result = await this.transitionUsing(repository, page.id, to)
        events.push(result.event)
      }
      return events
    })
  }

  async recordAudits(
    events: { pageId: string; from: PageStatus; to: PageStatus }[],
    actorId?: string | null
  ): Promise<void> {
    for (const event of events) {
      await this.auditService.record({
        actorId: actorId ?? null,
        entityType: AuditEntityType.PAGE,
        entityId: event.pageId,
        action: 'TRANSITION',
        fromState: event.from,
        toState: event.to
      })
    }
  }
}
