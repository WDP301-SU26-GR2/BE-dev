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
    const page = await this.chapterRepository.findPageById(pageId)
    if (!page) throw PageNotFoundException
    const allowed = PAGE_TRANSITIONS[page.status] ?? []
    if (!allowed.includes(to)) throw InvalidPageTransitionException
    const updated = await this.chapterRepository.updatePageStatus(pageId, to)
    await this.auditService.record({
      actorId: actorId ?? null,
      entityType: AuditEntityType.PAGE,
      entityId: pageId,
      action: 'TRANSITION',
      fromState: page.status,
      toState: to
    })
    return updated
  }
}
