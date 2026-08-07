import { Injectable } from '@nestjs/common'
import { AuditEntityType, PublicationType } from '@prisma/client'
import { AppConfigService } from 'src/modules/app-config/app-config.service'
import { AuditService } from 'src/modules/audit/audit.service'
import { normalizeMagazine } from 'src/core/http/schemas/magazine.schema'
import {
  MagazineAlreadyExistsException,
  MagazineInUseException,
  MagazineNotFoundException,
  PublicationTypeInUseException,
  MagazineNotRegisteredException,
  PublicationTypeNotSupportedException
} from './errors/magazine.errors'
import { MagazineUsageSeriesAdapter } from 'src/modules/series/adapters/magazine-usage-series.adapter'
import { MagazineUsageSurveyAdapter } from 'src/modules/survey/adapters/magazine-usage-survey.adapter'

export interface MagazineEntryOutput {
  name: string
  publicationTypes: PublicationType[]
}

@Injectable()
export class MagazineRegistryService {
  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly auditService: AuditService,
    private readonly seriesAdapter: MagazineUsageSeriesAdapter,
    private readonly surveyAdapter: MagazineUsageSurveyAdapter
  ) {}

  async getMagazines(): Promise<MagazineEntryOutput[]> {
    return this.appConfigService.getMagazines()
  }

  async getMagazine(name: string): Promise<MagazineEntryOutput | null> {
    const normalized = normalizeMagazine(name)
    const magazines = await this.getMagazines()
    return magazines.find((m) => normalizeMagazine(m.name) === normalized) ?? null
  }

  async isRegistered(magazine: string): Promise<boolean> {
    const normalized = normalizeMagazine(magazine)
    const magazines = await this.getMagazines()
    return magazines.some((m) => normalizeMagazine(m.name) === normalized)
  }

  async supportsPublicationType(magazine: string, publicationType: PublicationType): Promise<boolean> {
    const entry = await this.getMagazine(magazine)
    return entry ? entry.publicationTypes.includes(publicationType) : false
  }

  async createMagazine(
    name: string,
    publicationTypes: PublicationType[],
    actorId: string
  ): Promise<MagazineEntryOutput> {
    const normalized = normalizeMagazine(name)
    const magazines = await this.getMagazines()
    if (magazines.some((m) => normalizeMagazine(m.name) === normalized)) throw MagazineAlreadyExistsException
    const entry: MagazineEntryOutput = { name: normalized, publicationTypes }
    const { configId, magazines: updated } = await this.appConfigService.replaceMagazines(
      [...magazines, entry],
      actorId
    )
    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.APP_CONFIG,
      entityId: configId,
      action: 'MAGAZINE_CREATE',
      reason: `Added magazine: ${normalized}`
    })
    return (updated as MagazineEntryOutput[]).find((m) => normalizeMagazine(m.name) === normalized) ?? entry
  }

  async updateMagazine(
    name: string,
    publicationTypes: PublicationType[],
    actorId: string
  ): Promise<MagazineEntryOutput> {
    const normalized = normalizeMagazine(name)
    const magazines = await this.getMagazines()
    const idx = magazines.findIndex((m) => normalizeMagazine(m.name) === normalized)
    if (idx === -1) throw MagazineNotFoundException
    const currentEntry = magazines[idx]
    for (const pt of currentEntry.publicationTypes) {
      if (!publicationTypes.includes(pt)) {
        const sUsage = await this.seriesAdapter.countByMagazineAndType(normalized, pt)
        const svUsage = await this.surveyAdapter.countByMagazineAndType(normalized, pt)
        if (sUsage > 0 || svUsage > 0) throw PublicationTypeInUseException
      }
    }
    const next = magazines.map((m, i) => (i === idx ? { name: normalized, publicationTypes } : m))
    const { configId } = await this.appConfigService.replaceMagazines(next, actorId)
    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.APP_CONFIG,
      entityId: configId,
      action: 'MAGAZINE_UPDATE',
      reason: `Updated magazine: ${normalized}`
    })
    return next[idx]
  }

  async deleteMagazine(name: string, actorId: string): Promise<void> {
    const normalized = normalizeMagazine(name)
    const magazines = await this.getMagazines()
    const idx = magazines.findIndex((m) => normalizeMagazine(m.name) === normalized)
    if (idx === -1) throw MagazineNotFoundException
    const sUsage = await this.seriesAdapter.countByMagazine(normalized)
    const svUsage = await this.surveyAdapter.countByMagazine(normalized)
    if (sUsage > 0 || svUsage > 0) throw MagazineInUseException
    const next = magazines.filter((_, i) => i !== idx)
    const { configId } = await this.appConfigService.replaceMagazines(next, actorId)
    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.APP_CONFIG,
      entityId: configId,
      action: 'MAGAZINE_DELETE',
      reason: `Deleted magazine: ${normalized}`
    })
  }

  /**
   * Gate SERIALIZATION: tên phải trong danh mục VÀ nhịp phải được tạp chí chấp nhận.
   * KHÔNG bypass khi danh mục rỗng (hardening 2026-08-07): registry rỗng ⇒ mọi tên đều "chưa đăng ký"
   * ⇒ 422 `MagazineNotRegistered`. Nhờ đó hệ thống mới toanh KHÔNG serial hoá được cho tới khi admin
   * tạo ≥1 tạp chí — chặn tận gốc việc magazine free-text lọt vào Series thành orphan (xem bug orphan-magazine).
   */
  async assertSlotAllowed(magazine: string, publicationType: PublicationType): Promise<void> {
    const entries = await this.getMagazines()
    const normalized = normalizeMagazine(magazine)
    const current = entries.find((e) => normalizeMagazine(e.name) === normalized)
    if (!current) throw MagazineNotRegisteredException
    if (!current.publicationTypes.includes(publicationType)) throw PublicationTypeNotSupportedException
  }

  /** Gate FORMAT_CHANGE: chỉ kiểm nhịp theo magazine hiện tại. Magazine null/danh mục rỗng → bypass. */
  async assertPublicationTypeAllowed(magazine: string | null, publicationType: PublicationType): Promise<void> {
    if (!magazine) return
    const entries = await this.getMagazines()
    if (entries.length === 0) return
    const normalized = normalizeMagazine(magazine)
    const current = entries.find((e) => normalizeMagazine(e.name) === normalized)
    if (!current) return
    if (!current.publicationTypes.includes(publicationType)) throw PublicationTypeNotSupportedException
  }
}
