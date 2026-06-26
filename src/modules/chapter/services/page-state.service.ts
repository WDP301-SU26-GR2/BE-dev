import { Injectable } from '@nestjs/common'
import { PageStatus } from '@prisma/client'
import { PAGE_TRANSITIONS } from '../chapter.constant'
import { InvalidPageTransitionException, PageNotFoundException } from '../errors/chapter.errors'
import { ChapterRepository } from '../chapter.repo'

@Injectable()
export class PageStateService {
  constructor(private readonly chapterRepository: ChapterRepository) {}

  async transition(pageId: string, to: PageStatus) {
    const page = await this.chapterRepository.findPageById(pageId)
    if (!page) throw PageNotFoundException
    const allowed = PAGE_TRANSITIONS[page.status] ?? []
    if (!allowed.includes(to)) throw InvalidPageTransitionException
    return this.chapterRepository.updatePageStatus(pageId, to)
  }
}
