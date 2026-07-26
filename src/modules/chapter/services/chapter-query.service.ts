import { Injectable } from '@nestjs/common'
import { toChapterRes } from '../chapter.mapper'
import { ChapterRepository } from '../chapter.repo'
import { ChapterNotFoundException } from '../errors/chapter.errors'
import { ChapterProgressService } from './chapter-progress.service'

@Injectable()
export class ChapterQueryService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly progressService: ChapterProgressService
  ) {}

  async getOne(chapterId: string) {
    const chapter = await this.chapterRepository.findChapterWithRelations(chapterId)
    if (!chapter) throw ChapterNotFoundException
    return toChapterRes(chapter)
  }

  async listBySeries(seriesId: string) {
    const chapters = await this.chapterRepository.findChaptersBySeriesId(seriesId)
    return { items: chapters.map(toChapterRes) }
  }

  progress(user: { userId: string; roleName: string }, chapterId: string) {
    return this.progressService.getProgress(user, chapterId)
  }

  studioOverview(userId: string) {
    return this.progressService.overviewForMangaka(userId)
  }
}
