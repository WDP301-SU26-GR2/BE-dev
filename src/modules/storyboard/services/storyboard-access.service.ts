import { Injectable } from '@nestjs/common'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import {
  ChapterNotFoundException,
  StoryboardNotFoundException,
  NotSeriesOwnerException,
  SeriesNotFoundException
} from '../errors/storyboard.errors'
import { StoryboardRepo } from '../storyboard.repo'

// Spec 28: Storyboard giờ luôn thuộc CHƯƠNG — scope chỉ còn chapterId.
export type StoryboardScope = { chapterId?: string }

@Injectable()
export class StoryboardAccessService {
  constructor(private readonly repository: StoryboardRepo) {}

  async requireSeriesStoryboard(seriesId: string, storyboardId: string, scope?: StoryboardScope) {
    if (!isObjectId(seriesId)) throw SeriesNotFoundException
    const series = await this.repository.findSeriesForGuard(seriesId)
    if (!series) throw SeriesNotFoundException
    if (!isObjectId(storyboardId)) throw StoryboardNotFoundException
    const storyboard = await this.repository.findStoryboardById(storyboardId)
    if (!storyboard || storyboard.seriesId !== seriesId) throw StoryboardNotFoundException
    if (scope?.chapterId && storyboard.chapterId !== scope.chapterId) throw StoryboardNotFoundException
    return { series, storyboard }
  }

  async requireOwnerStoryboard(seriesId: string, mangakaId: string, storyboardId: string, scope?: StoryboardScope) {
    const result = await this.requireSeriesStoryboard(seriesId, storyboardId, scope)
    if (result.series.mangakaId !== mangakaId) throw NotSeriesOwnerException
    return result
  }

  async chapterSeriesId(chapterId: string): Promise<string> {
    if (!isObjectId(chapterId)) throw ChapterNotFoundException
    const chapter = await this.repository.findChapterForStoryboardGuard(chapterId)
    if (!chapter) throw ChapterNotFoundException
    return chapter.seriesId
  }
}
