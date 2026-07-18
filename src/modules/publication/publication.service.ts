import { Injectable } from '@nestjs/common'
import { RoleName } from 'src/core/security/constants/role.constant'
import { AuditEntityType } from '@prisma/client'
import { PublicationRepo } from './publication.repo'
import { toPublicationVersionRes } from './publication.mapper'
import { CreatePublicationVersionType, UpdatePublicationVersionType } from './schemas/publication-schemas'
import {
  PublicationVersionNotFoundException,
  SeriesAccessDeniedException,
  SeriesNotFoundException
} from './errors/publication.errors'
import { AuditService } from 'src/modules/audit/audit.service'
import { PublicationMessages } from './publication.messages'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class PublicationService {
  constructor(
    private readonly repo: PublicationRepo,
    private readonly auditService: AuditService
  ) {}

  private assertSeriesScope(series: { mangakaId: string; editorId: string | null }, userId: string, roleName: string) {
    if (roleName === RoleName.BOARD_MEMBER || roleName === RoleName.SUPER_ADMIN) return
    if (roleName === RoleName.EDITOR && series.editorId === userId) return
    if (roleName === RoleName.MANGAKA && series.mangakaId === userId) return
    throw SeriesAccessDeniedException
  }

  private async loadSeriesScoped(
    seriesId: string,
    userId: string,
    roleName: string
  ): Promise<{ id: string; mangakaId: string; editorId: string | null }> {
    if (!OBJECT_ID_RE.test(seriesId)) throw SeriesNotFoundException
    const series = await this.repo.findSeriesBasics(seriesId)
    if (!series) throw SeriesNotFoundException
    this.assertSeriesScope(series, userId, roleName)
    return series
  }

  async create(userId: string, roleName: string, seriesId: string, dto: CreatePublicationVersionType) {
    await this.loadSeriesScoped(seriesId, userId, roleName)
    const created = await this.repo.create(seriesId, dto)
    await this.auditService.record({
      actorId: userId,
      entityType: AuditEntityType.PUBLICATION_VERSION,
      entityId: created.id,
      action: 'CREATE'
    })
    return toPublicationVersionRes(created)
  }

  async listBySeries(userId: string, roleName: string, seriesId: string) {
    await this.loadSeriesScoped(seriesId, userId, roleName)
    const items = await this.repo.findManyBySeries(seriesId)
    return { items: items.map(toPublicationVersionRes) }
  }

  private async loadVersionScoped(id: string, userId: string, roleName: string) {
    if (!OBJECT_ID_RE.test(id)) throw PublicationVersionNotFoundException
    const version = await this.repo.findById(id)
    if (!version) throw PublicationVersionNotFoundException
    const series = await this.repo.findSeriesBasics(version.seriesId)
    if (!series) throw PublicationVersionNotFoundException
    this.assertSeriesScope(series, userId, roleName)
    return version
  }

  async getById(userId: string, roleName: string, id: string) {
    const version = await this.loadVersionScoped(id, userId, roleName)
    return toPublicationVersionRes(version)
  }

  async update(userId: string, roleName: string, id: string, dto: UpdatePublicationVersionType) {
    await this.loadVersionScoped(id, userId, roleName)
    const updated = await this.repo.update(id, dto)
    await this.auditService.record({
      actorId: userId,
      entityType: AuditEntityType.PUBLICATION_VERSION,
      entityId: id,
      action: 'UPDATE'
    })
    return toPublicationVersionRes(updated)
  }

  async remove(userId: string, roleName: string, id: string) {
    await this.loadVersionScoped(id, userId, roleName)
    await this.repo.delete(id)
    await this.auditService.record({
      actorId: userId,
      entityType: AuditEntityType.PUBLICATION_VERSION,
      entityId: id,
      action: 'DELETE'
    })
    return { message: PublicationMessages.response.deleted }
  }
}
