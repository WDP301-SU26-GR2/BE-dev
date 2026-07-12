import { Injectable } from '@nestjs/common'
import { SeriesStatus } from '@prisma/client'
import {
  ChapterNotFoundException,
  DuplicateChapterNumberException,
  EndingAllowanceExceededException,
  NotSeriesOwnerException,
  SeriesNotSerializedException
} from '../errors/chapter.errors'
import { ChapterRepository } from '../chapter.repo'
import { CreateChapterBodyType } from '../schemas/chapter-schemas'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

// Fix-1 G-1 (Requiment Flow 5): CANCELLING/COMPLETING vẫn được tạo chapter kết thúc; HIATUS thì không.
const CHAPTER_CREATABLE_STATUSES: SeriesStatus[] = [
  SeriesStatus.SERIALIZED,
  SeriesStatus.CANCELLING,
  SeriesStatus.COMPLETING
]

@Injectable()
export class ChapterCreationService {
  constructor(private readonly chapterRepository: ChapterRepository) {}

  async create(userId: string, body: CreateChapterBodyType) {
    if (!OBJECT_ID_RE.test(body.seriesId)) throw ChapterNotFoundException
    const series = await this.chapterRepository.findSeriesById(body.seriesId)
    if (!series) throw ChapterNotFoundException
    if (series.mangakaId !== userId) throw NotSeriesOwnerException
    if (!CHAPTER_CREATABLE_STATUSES.includes(series.status)) throw SeriesNotSerializedException
    if (series.status === SeriesStatus.CANCELLING) {
      const allowance = series.endingChapterAllowance
      const snapshot = series.chapterCountAtCancelling
      // snapshot null = series cancel trước khi có feature → không enforce (spec §1.3).
      if (allowance != null && snapshot != null) {
        const current = await this.chapterRepository.countChaptersBySeriesId(body.seriesId)
        if (current - snapshot >= allowance) throw EndingAllowanceExceededException
      }
    }
    const dup = await this.chapterRepository.findChapterByNumber(body.seriesId, body.chapterNumber)
    if (dup) throw DuplicateChapterNumberException
    return this.chapterRepository.createChapter({
      seriesId: body.seriesId,
      chapterNumber: body.chapterNumber,
      title: body.title ?? null
    })
  }
}
