import { Injectable } from '@nestjs/common'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RoleName } from 'src/core/security/constants/role.constant'
import {
  ChapterNotFoundException,
  StoryboardNotFoundException,
  SeriesAccessDeniedException,
  SeriesNotFoundException
} from '../errors/storyboard.errors'
import { toStoryboardRes } from '../storyboard.mapper'
import { StoryboardRepo } from '../storyboard.repo'
import type { StoryboardCaller } from '../storyboard.service'

@Injectable()
export class StoryboardQueryService {
  constructor(private readonly repository: StoryboardRepo) {}

  // Spec 28: Storyboard giờ chỉ phục vụ phác thảo CHƯƠNG — list/get theo series-scoped (proposal) đã xoá.
  // Chỉ còn 2 method chapter-scoped.

  async chapterListStoryboards(caller: StoryboardCaller, chapterId: string) {
    const seriesId = await this.chapterSeriesId(chapterId)
    await this.requireSeriesScope(caller, seriesId)
    const storyboards = await this.repository.findStoryboardsByChapterId(chapterId)
    return { items: storyboards.map(toStoryboardRes) }
  }

  async chapterGetStoryboard(caller: StoryboardCaller, chapterId: string, storyboardId: string) {
    const seriesId = await this.chapterSeriesId(chapterId)
    await this.requireSeriesScope(caller, seriesId)
    if (!isObjectId(storyboardId)) throw StoryboardNotFoundException
    const storyboard = await this.repository.findStoryboardById(storyboardId)
    if (!storyboard || storyboard.chapterId !== chapterId) throw StoryboardNotFoundException
    return toStoryboardRes(storyboard)
  }

  private async requireSeriesScope(caller: StoryboardCaller, seriesId: string) {
    if (!isObjectId(seriesId)) throw SeriesNotFoundException
    const series = await this.repository.findSeriesForGuard(seriesId)
    if (!series) throw SeriesNotFoundException
    const { userId, roleName } = caller
    if (roleName === RoleName.SUPER_ADMIN || roleName === RoleName.BOARD_MEMBER) return series
    if (roleName === RoleName.EDITOR && series.editorId === userId) return series
    if (roleName === RoleName.MANGAKA && series.mangakaId === userId) return series
    throw SeriesAccessDeniedException
  }

  private async chapterSeriesId(chapterId: string): Promise<string> {
    if (!isObjectId(chapterId)) throw ChapterNotFoundException
    const chapter = await this.repository.findChapterForStoryboardGuard(chapterId)
    if (!chapter) throw ChapterNotFoundException
    return chapter.seriesId
  }
}
