import { Injectable } from '@nestjs/common'
import { NameKind, NameStatus, SeriesStatus } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import {
  ChapterNameAlreadyExistsException,
  ChapterNotDraftForNameException,
  ChapterNotFoundException,
  InvalidNameStateException,
  NameNotDeletableException,
  NameNotFoundException,
  NotSeriesOwnerException,
  SeriesNotSerializedException
} from '../errors/name.errors'
import { toNameRes } from '../name.mapper'
import { NameMessages } from '../name.messages'
import { NameRepo } from '../name.repo'
import { AddNamePageBodyType, CreateChapterNameBodyType, UpdateNamePagesBodyType } from '../schemas/name-schemas'
import { NameAccessService, NameScope } from './name-access.service'

const CHAPTER_CREATABLE_STATUSES: SeriesStatus[] = [
  SeriesStatus.SERIALIZED,
  SeriesStatus.CANCELLING,
  SeriesStatus.COMPLETING
]

@Injectable()
export class NameContentService {
  constructor(
    private readonly access: NameAccessService,
    private readonly repository: NameRepo
  ) {}

  async createChapterName(mangakaId: string, chapterId: string, body: CreateChapterNameBodyType) {
    if (!isObjectId(chapterId)) throw ChapterNotFoundException
    const chapter = await this.repository.findChapterForNameGuard(chapterId)
    if (!chapter) throw ChapterNotFoundException
    if (chapter.series?.mangakaId !== mangakaId) throw NotSeriesOwnerException
    if (chapter.status !== 'DRAFT') throw ChapterNotDraftForNameException
    if (!chapter.series?.status || !CHAPTER_CREATABLE_STATUSES.includes(chapter.series.status)) {
      throw SeriesNotSerializedException
    }
    if (chapter.nameId) throw ChapterNameAlreadyExistsException
    const created = await this.repository.createChapterNameForChapter({
      chapterId,
      seriesId: chapter.seriesId,
      chapterNumber: chapter.chapterNumber,
      namePages: body.namePages
    })
    return toNameRes(created)
  }

  updatePages(mangakaId: string, seriesId: string, nameId: string, body: UpdateNamePagesBodyType) {
    return this.doUpdatePages(mangakaId, seriesId, nameId, body, { kind: NameKind.PROPOSAL })
  }

  async chapterUpdatePages(mangakaId: string, chapterId: string, nameId: string, body: UpdateNamePagesBodyType) {
    const seriesId = await this.access.chapterSeriesId(chapterId)
    return this.doUpdatePages(mangakaId, seriesId, nameId, body, { kind: NameKind.CHAPTER, chapterId })
  }

  private async doUpdatePages(
    mangakaId: string,
    seriesId: string,
    nameId: string,
    body: UpdateNamePagesBodyType,
    scope: NameScope & { kind: NameKind }
  ) {
    const { name } = await this.access.requireOwnerName(seriesId, mangakaId, nameId, scope)
    this.requireEditable(name.status)
    return toNameRes(await this.repository.updateNamePages(nameId, body.pages))
  }

  addPage(mangakaId: string, seriesId: string, nameId: string, page: AddNamePageBodyType) {
    return this.doAddPage(mangakaId, seriesId, nameId, page, { kind: NameKind.PROPOSAL })
  }

  async chapterAddPage(mangakaId: string, chapterId: string, nameId: string, page: AddNamePageBodyType) {
    const seriesId = await this.access.chapterSeriesId(chapterId)
    return this.doAddPage(mangakaId, seriesId, nameId, page, { kind: NameKind.CHAPTER, chapterId })
  }

  private async doAddPage(
    mangakaId: string,
    seriesId: string,
    nameId: string,
    page: AddNamePageBodyType,
    scope: NameScope & { kind: NameKind }
  ) {
    const { name } = await this.access.requireOwnerName(seriesId, mangakaId, nameId, scope)
    this.requireEditable(name.status)
    return toNameRes(await this.repository.appendNamePage(nameId, page))
  }

  async chapterSubmit(mangakaId: string, chapterId: string, nameId: string) {
    const seriesId = await this.access.chapterSeriesId(chapterId)
    const { name } = await this.access.requireOwnerName(seriesId, mangakaId, nameId, {
      kind: NameKind.CHAPTER,
      chapterId
    })
    if (name.status !== NameStatus.DRAFT) throw InvalidNameStateException
    return toNameRes(
      await this.repository.updateNameStatus(nameId, {
        status: NameStatus.SUBMITTED,
        submittedAt: new Date()
      })
    )
  }

  async deleteChapterName(mangakaId: string, chapterId: string, nameId: string) {
    if (!isObjectId(chapterId)) throw ChapterNotFoundException
    const chapter = await this.repository.findChapterForNameGuard(chapterId)
    if (!chapter) throw ChapterNotFoundException
    if (chapter.series?.mangakaId !== mangakaId) throw NotSeriesOwnerException
    if (!isObjectId(nameId)) throw NameNotFoundException
    const name = await this.repository.findNameById(nameId)
    if (!name || name.chapterId !== chapterId) throw NameNotFoundException
    if (chapter.status !== 'DRAFT' || name.status === NameStatus.APPROVED) throw NameNotDeletableException
    await this.repository.deleteChapterName(chapterId, nameId)
    return { message: NameMessages.response.chapterNameDeleted }
  }

  private requireEditable(status: NameStatus) {
    if (status !== NameStatus.DRAFT && status !== NameStatus.REVISION) throw InvalidNameStateException
  }
}
