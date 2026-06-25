import { Injectable } from '@nestjs/common'
import { ManuscriptStatus } from '@prisma/client'
import { MANUSCRIPT_TRANSITIONS } from '../chapter.constant'
import { ChapterNotFoundException, InvalidManuscriptTransitionException } from '../errors/chapter.errors'
import { ChapterRepository } from '../chapter.repo'

@Injectable()
export class ManuscriptStateService {
  constructor(private readonly chapterRepository: ChapterRepository) {}

  // Single-writer cho Manuscript.status + Chapter.status (BR-PROD-01). Mọi chuyển trạng thái production đi qua đây.
  async transition(chapterId: string, to: ManuscriptStatus, opts: { changedBy: string; reason?: string }) {
    const manuscript = await this.chapterRepository.findManuscriptByChapterId(chapterId)
    if (!manuscript) throw ChapterNotFoundException
    const from = manuscript.status
    const allowed = MANUSCRIPT_TRANSITIONS[from] ?? []
    if (!allowed.includes(to)) throw InvalidManuscriptTransitionException
    return this.chapterRepository.applyManuscriptTransition(chapterId, manuscript.id, {
      from,
      to,
      changedBy: opts.changedBy,
      reason: opts.reason
    })
  }
}
