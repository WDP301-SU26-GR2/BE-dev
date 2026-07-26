import { Injectable } from '@nestjs/common'
import { NameKind } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RoleName } from 'src/core/security/constants/role.constant'
import {
  ChapterNotFoundException,
  NameNotFoundException,
  SeriesAccessDeniedException,
  SeriesNotFoundException
} from '../errors/name.errors'
import { toNameRes } from '../name.mapper'
import { NameRepo } from '../name.repo'
import type { NameCaller } from '../name.service'

@Injectable()
export class NameQueryService {
  constructor(private readonly repository: NameRepo) {}

  async listNames(caller: NameCaller, seriesId: string, page?: { limit: number; offset: number }) {
    const series = await this.requireSeriesScope(caller, seriesId)
    const names = await this.repository.findNamesBySeriesIdAndKind(series.id, NameKind.PROPOSAL, page)
    return { items: names.map(toNameRes) }
  }

  async getName(caller: NameCaller, seriesId: string, nameId: string) {
    await this.requireSeriesScope(caller, seriesId)
    if (!isObjectId(nameId)) throw NameNotFoundException
    const name = await this.repository.findNameById(nameId)
    if (!name || name.seriesId !== seriesId || name.kind !== NameKind.PROPOSAL) throw NameNotFoundException
    return toNameRes(name)
  }

  async chapterListNames(caller: NameCaller, chapterId: string) {
    const seriesId = await this.chapterSeriesId(chapterId)
    await this.requireSeriesScope(caller, seriesId)
    const names = await this.repository.findNamesByChapterId(chapterId)
    return { items: names.map(toNameRes) }
  }

  async chapterGetName(caller: NameCaller, chapterId: string, nameId: string) {
    const seriesId = await this.chapterSeriesId(chapterId)
    await this.requireSeriesScope(caller, seriesId)
    if (!isObjectId(nameId)) throw NameNotFoundException
    const name = await this.repository.findNameById(nameId)
    if (!name || name.chapterId !== chapterId) throw NameNotFoundException
    return toNameRes(name)
  }

  private async requireSeriesScope(caller: NameCaller, seriesId: string) {
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
    const chapter = await this.repository.findChapterForNameGuard(chapterId)
    if (!chapter) throw ChapterNotFoundException
    return chapter.seriesId
  }
}
