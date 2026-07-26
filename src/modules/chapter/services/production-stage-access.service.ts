import { Injectable } from '@nestjs/common'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ChapterRepository } from '../chapter.repo'
import { ChapterNotFoundException } from '../errors/chapter.errors'
import { StageAccessDeniedException } from '../errors/production-stage.errors'

@Injectable()
export class ProductionStageAccessService {
  constructor(private readonly chapterRepo: ChapterRepository) {}

  async assertReadAccess(user: { userId: string; roleName: string }, chapterId: string) {
    if (!isObjectId(chapterId)) throw ChapterNotFoundException
    const chapter = await this.chapterRepo.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepo.findSeriesById(chapter.seriesId)
    if (!series) throw ChapterNotFoundException
    const allowed =
      (user.roleName === RoleName.MANGAKA && series.mangakaId === user.userId) ||
      (user.roleName === RoleName.EDITOR && series.editorId === user.userId) ||
      user.roleName === RoleName.BOARD_MEMBER ||
      user.roleName === RoleName.SUPER_ADMIN
    if (!allowed) throw StageAccessDeniedException
    return { chapter, series }
  }

  async assertMangakaOwner(userId: string, chapterId: string) {
    const context = await this.assertReadAccess({ userId, roleName: RoleName.MANGAKA }, chapterId)
    if (context.series.mangakaId !== userId) throw StageAccessDeniedException
    return context
  }
}
