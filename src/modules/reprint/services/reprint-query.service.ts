import { Injectable } from '@nestjs/common'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ReprintRequestErrors } from '../errors/reprint-request.error'
import { ReprintRequestRepo } from '../reprint-request.repo'
import { ActorContext, ReprintAccessPolicy, ReprintAccessSubject } from './reprint-access.policy'
import { loadReprintAccessContext } from './reprint-service.helper'

@Injectable()
export class ReprintQueryService {
  constructor(
    private readonly repository: ReprintRequestRepo,
    private readonly accessPolicy: ReprintAccessPolicy
  ) {}

  async findAll(userId: string, roleName: string, filters: { status?: string; seriesId?: string }) {
    const rows = await this.repository.findManyScoped({
      userId,
      roleName,
      status: filters.status,
      seriesId: filters.seriesId
    })
    if (roleName !== RoleName.MANGAKA) return rows

    const actor = { userId, roleName }
    return Promise.all(
      rows.map(async (request) => {
        const subject = await this.getAccessSubject(request)
        return { ...request, chapters: this.accessPolicy.filterReadableChapters(actor, subject) }
      })
    )
  }

  async findById(id: string, actor: ActorContext) {
    const request = await this.loadRequest(id)
    const subject = await this.getAccessSubject(request)
    if (!this.accessPolicy.canReadRequest(actor, subject)) throw ReprintRequestErrors.NotFound()
    return { ...request, chapters: this.accessPolicy.filterReadableChapters(actor, subject) }
  }

  async getChapters(id: string, actor: ActorContext) {
    const request = await this.loadRequest(id)
    const subject = await this.getAccessSubject(request)
    if (!this.accessPolicy.canReadRequest(actor, subject)) throw ReprintRequestErrors.NotFound()
    return this.accessPolicy.filterReadableChapters(actor, subject)
  }

  async getChapterById(id: string, chapterId: string, actor: ActorContext) {
    if (!isObjectId(chapterId)) throw ReprintRequestErrors.NotFound()
    const request = await this.loadRequest(id)
    const subject = await this.getAccessSubject(request)
    if (!this.accessPolicy.canReadChapter(actor, subject, chapterId)) throw ReprintRequestErrors.NotFound()

    const chapter = request.chapters?.find((item) => item.originalChapterId === chapterId)
    if (!chapter) throw ReprintRequestErrors.ChapterNotFound()
    return chapter
  }

  private async loadRequest(id: string) {
    if (!isObjectId(id)) throw ReprintRequestErrors.NotFound()
    const request = await this.repository.findById(id)
    if (!request) throw ReprintRequestErrors.NotFound()
    return request
  }

  private async getAccessSubject<T extends ReprintAccessSubject['chapters'][number]>(request: {
    seriesId: string
    requestedBy?: string | null
    chapters?: T[] | null
  }): Promise<Omit<ReprintAccessSubject, 'chapters'> & { chapters: T[] }> {
    const access = await loadReprintAccessContext(this.repository, request.seriesId, request.requestedBy ?? null)
    return {
      editorId: access.editorId ?? request.requestedBy ?? null,
      ownerMangakaIds: access.ownerMangakaIds,
      chapters: request.chapters ?? []
    }
  }
}
