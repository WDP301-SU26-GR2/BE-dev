import { Injectable } from '@nestjs/common'
import { AuditEntityType, ManuscriptStatus, PageStatus } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { MANUSCRIPT_TRANSITIONS } from '../chapter.constant'
import { ChapterNotFoundException, InvalidManuscriptTransitionException } from '../errors/chapter.errors'
import { ChapterRepository } from '../chapter.repo'
import { PageStateService } from './page-state.service'

@Injectable()
export class ManuscriptStateService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly auditService: AuditService,
    private readonly pageStateService: PageStateService
  ) {}

  async assertCanTransition(chapterId: string, to: ManuscriptStatus) {
    const manuscript = await this.chapterRepository.findManuscriptByChapterId(chapterId)
    if (!manuscript) throw ChapterNotFoundException
    const allowed = MANUSCRIPT_TRANSITIONS[manuscript.status] ?? []
    if (!allowed.includes(to)) throw InvalidManuscriptTransitionException
    return manuscript
  }

  // Single-writer cho Manuscript.status + Chapter.status (BR-PROD-01). Mọi chuyển trạng thái production đi qua đây.
  async transition(chapterId: string, to: ManuscriptStatus, opts: { changedBy: string; reason?: string }) {
    const manuscript = await this.assertCanTransition(chapterId, to)
    const from = manuscript.status
    const updated = await this.chapterRepository.applyManuscriptTransition(chapterId, manuscript.id, {
      from,
      to,
      changedBy: opts.changedBy,
      reason: opts.reason
    })
    await this.auditService.record({
      actorId: opts.changedBy,
      entityType: AuditEntityType.MANUSCRIPT,
      entityId: manuscript.id,
      action: 'TRANSITION',
      fromState: from,
      toState: to,
      reason: opts.reason
    })
    return updated
  }

  /**
   * Atomically persists the manuscript/chapter transition and the driven page transitions.
   * Audit is emitted only after the Mongo transaction commits.
   */
  async transitionWithPages(
    chapterId: string,
    to: ManuscriptStatus,
    opts: { changedBy: string; reason?: string },
    pageFrom: PageStatus[],
    pageTo: PageStatus
  ) {
    let manuscriptEvent!: { id: string; from: ManuscriptStatus; to: ManuscriptStatus }
    let pageEvents: { pageId: string; from: PageStatus; to: PageStatus }[] = []

    const updated = await this.chapterRepository.withTransaction(async (repository) => {
      const manuscript = await repository.findManuscriptByChapterId(chapterId)
      if (!manuscript) throw ChapterNotFoundException
      const from = manuscript.status
      const allowed = MANUSCRIPT_TRANSITIONS[from] ?? []
      if (!allowed.includes(to)) throw InvalidManuscriptTransitionException

      const result = await repository.applyManuscriptTransition(chapterId, manuscript.id, {
        from,
        to,
        changedBy: opts.changedBy,
        reason: opts.reason
      })
      manuscriptEvent = { id: manuscript.id, from, to }
      pageEvents = await this.pageStateService.transitionAllUsing(repository, chapterId, pageFrom, pageTo)
      return result
    })

    await this.auditService.record({
      actorId: opts.changedBy,
      entityType: AuditEntityType.MANUSCRIPT,
      entityId: manuscriptEvent.id,
      action: 'TRANSITION',
      fromState: manuscriptEvent.from,
      toState: manuscriptEvent.to,
      reason: opts.reason
    })
    await this.pageStateService.recordAudits(pageEvents, opts.changedBy)
    return updated
  }
}
