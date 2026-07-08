import { Injectable } from '@nestjs/common'
import { NameStatus, SeriesStatus } from '@prisma/client'
import {
  ChapterNotFoundException,
  DuplicateChapterNumberException,
  NameNotApprovedException,
  NameNotInSeriesException,
  NotSeriesOwnerException,
  SeriesNotSerializedException
} from '../errors/chapter.errors'
import { ChapterRepository } from '../chapter.repo'
import { CreateChapterBodyType } from '../schemas/chapter-schemas'

@Injectable()
export class ChapterCreationService {
  constructor(private readonly chapterRepository: ChapterRepository) {}

  // A-CHP-01: tạo Chapter từ Name APPROVED. Manuscript khởi tạo DRAFT (DRAFT→IN_PRODUCTION khi upload page đầu — A-CHP-03).
  async create(userId: string, body: CreateChapterBodyType) {
    const series = await this.chapterRepository.findSeriesById(body.seriesId)
    if (!series) throw ChapterNotFoundException
    if (series.mangakaId !== userId) throw NotSeriesOwnerException
    // A2 (Spec 1): chỉ tạo chapter cho series đã được Board serial hoá.
    if (series.status !== SeriesStatus.SERIALIZED) throw SeriesNotSerializedException

    const name = await this.chapterRepository.findNameById(body.nameId)
    if (!name || name.seriesId !== body.seriesId) throw NameNotInSeriesException
    if (name.status !== NameStatus.APPROVED) throw NameNotApprovedException

    const dup = await this.chapterRepository.findChapterByNumber(body.seriesId, body.chapterNumber)
    if (dup) throw DuplicateChapterNumberException

    return this.chapterRepository.createChapter({
      seriesId: body.seriesId,
      nameId: body.nameId,
      chapterNumber: body.chapterNumber,
      title: body.title ?? null
    })
  }
}
