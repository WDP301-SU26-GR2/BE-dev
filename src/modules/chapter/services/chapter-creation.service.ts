import { Injectable } from '@nestjs/common'
import { SeriesStatus } from '@prisma/client'
import {
  ChapterNotFoundException,
  DuplicateChapterNumberException,
  NotSeriesOwnerException,
  SeriesNotSerializedException
} from '../errors/chapter.errors'
import { ChapterRepository } from '../chapter.repo'
import { CreateChapterBodyType } from '../schemas/chapter-schemas'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class ChapterCreationService {
  constructor(private readonly chapterRepository: ChapterRepository) {}

  async create(userId: string, body: CreateChapterBodyType) {
    if (!OBJECT_ID_RE.test(body.seriesId)) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(body.seriesId)
    if (!series) throw ChapterNotFoundException
    if (series.mangakaId !== userId) throw NotSeriesOwnerException
    if (series.status !== SeriesStatus.SERIALIZED) throw SeriesNotSerializedException
    const dup = await this.chapterRepository.findChapterByNumber(body.seriesId, body.chapterNumber)
    if (dup) throw DuplicateChapterNumberException
    return this.chapterRepository.createChapter({
      seriesId: body.seriesId,
      chapterNumber: body.chapterNumber,
      title: body.title ?? null
    })
  }
}
