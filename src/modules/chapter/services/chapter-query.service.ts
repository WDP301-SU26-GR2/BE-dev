import { Injectable } from '@nestjs/common'
import { toChapterRes } from '../chapter.mapper'
import { ChapterRepository } from '../chapter.repo'
import { ChapterNotFoundException } from '../errors/chapter.errors'
import { ChapterPageAccessService } from './chapter-page-access.service'
import { ChapterProgressService } from './chapter-progress.service'

type ReadUser = { userId: string; roleName: string }

@Injectable()
export class ChapterQueryService {
  constructor(
    private readonly chapterRepository: ChapterRepository,
    private readonly progressService: ChapterProgressService,
    private readonly pageAccess: ChapterPageAccessService
  ) {}

  async getOne(user: ReadUser, chapterId: string) {
    await this.pageAccess.assertReadAccess(user.userId, user.roleName, chapterId)
    return this.getOneUnchecked(chapterId)
  }

  // Đọc KHÔNG kiểm quyền — chỉ dùng nội bộ SAU khi một mutation đã enforce quyền
  // (trả chapter vừa cập nhật cho chính actor đã được cho phép). KHÔNG expose ra controller.
  async getOneUnchecked(chapterId: string) {
    const chapter = await this.chapterRepository.findChapterWithRelations(chapterId)
    if (!chapter) throw ChapterNotFoundException
    return toChapterRes(chapter)
  }

  async listBySeries(user: ReadUser, seriesId: string) {
    await this.pageAccess.assertSeriesReadAccess(user.userId, user.roleName, seriesId)
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
