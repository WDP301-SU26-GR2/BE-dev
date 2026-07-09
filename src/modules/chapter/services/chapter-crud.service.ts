import { Injectable } from '@nestjs/common'
import { ChapterStatus } from '@prisma/client'
import {
  ChapterNotFoundException,
  NotSeriesOwnerException,
  ChapterNotEditableException,
  ChapterNumberLockedException,
  DuplicateChapterNumberException,
  ChapterNotDeletableException
} from '../errors/chapter.errors'
import { ChapterRepository } from '../chapter.repo'
import { UpdateChapterBodyType } from '../schemas/chapter-schemas'
import { ChapterMessages } from '../chapter.messages'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class ChapterCrudService {
  constructor(private readonly chapterRepository: ChapterRepository) {}

  async updateChapter(userId: string, chapterId: string, body: UpdateChapterBodyType) {
    if (!OBJECT_ID_RE.test(chapterId)) throw ChapterNotFoundException
    const chapter = await this.chapterRepository.findChapterWithSeries(chapterId)
    if (!chapter) throw ChapterNotFoundException
    if (chapter.series?.mangakaId !== userId) throw NotSeriesOwnerException
    if (chapter.status === ChapterStatus.PUBLISHED) throw ChapterNotEditableException

    const data: { title?: string; chapterNumber?: number } = {}
    if (body.title != null) data.title = body.title
    if (body.chapterNumber != null && body.chapterNumber !== chapter.chapterNumber) {
      if (chapter.status !== ChapterStatus.DRAFT) throw ChapterNumberLockedException
      const dup = await this.chapterRepository.findChapterByNumber(chapter.seriesId, body.chapterNumber)
      if (dup) throw DuplicateChapterNumberException
      data.chapterNumber = body.chapterNumber
    }
    await this.chapterRepository.updateChapter(chapterId, data)
    if (data.chapterNumber != null && chapter.nameId) {
      await this.chapterRepository.updateNameChapterNumber(chapter.nameId, data.chapterNumber)
    }
    return this.chapterRepository.findChapterWithRelations(chapterId)
  }

  async deleteChapter(userId: string, chapterId: string) {
    if (!OBJECT_ID_RE.test(chapterId)) throw ChapterNotFoundException
    const chapter = await this.chapterRepository.findChapterWithSeries(chapterId)
    if (!chapter) throw ChapterNotFoundException
    if (chapter.series?.mangakaId !== userId) throw NotSeriesOwnerException
    if (chapter.status !== ChapterStatus.DRAFT) throw ChapterNotDeletableException
    await this.chapterRepository.deleteChapterCascade(chapterId)
    return { message: ChapterMessages.response.chapterDeleted }
  }
}
