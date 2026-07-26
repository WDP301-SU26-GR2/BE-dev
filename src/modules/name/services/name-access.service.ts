import { Injectable } from '@nestjs/common'
import { NameKind } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import {
  ChapterNotFoundException,
  NameNotFoundException,
  NotSeriesOwnerException,
  SeriesNotFoundException
} from '../errors/name.errors'
import { NameRepo } from '../name.repo'

export type NameScope = { kind?: NameKind; chapterId?: string }

@Injectable()
export class NameAccessService {
  constructor(private readonly repository: NameRepo) {}

  async requireSeriesName(seriesId: string, nameId: string, scope?: NameScope) {
    if (!isObjectId(seriesId)) throw SeriesNotFoundException
    const series = await this.repository.findSeriesForGuard(seriesId)
    if (!series) throw SeriesNotFoundException
    if (!isObjectId(nameId)) throw NameNotFoundException
    const name = await this.repository.findNameById(nameId)
    if (!name || name.seriesId !== seriesId) throw NameNotFoundException
    if (scope?.kind && name.kind !== scope.kind) throw NameNotFoundException
    if (scope?.chapterId && name.chapterId !== scope.chapterId) throw NameNotFoundException
    return { series, name }
  }

  async requireOwnerName(seriesId: string, mangakaId: string, nameId: string, scope?: NameScope) {
    const result = await this.requireSeriesName(seriesId, nameId, scope)
    if (result.series.mangakaId !== mangakaId) throw NotSeriesOwnerException
    return result
  }

  async chapterSeriesId(chapterId: string): Promise<string> {
    if (!isObjectId(chapterId)) throw ChapterNotFoundException
    const chapter = await this.repository.findChapterForNameGuard(chapterId)
    if (!chapter) throw ChapterNotFoundException
    return chapter.seriesId
  }
}
