import { Injectable } from '@nestjs/common'
import { AuditEntityType, PublicationType } from '@prisma/client'
import { AppConfigRepository } from '../app-config.repo'
import { AuditService } from 'src/modules/audit/audit.service'
import { normalizeMagazine } from 'src/core/http/schemas/magazine.schema'
import {
  MagazineAlreadyExistsException,
  MagazineInUseException,
  MagazineNotFoundException,
  PublicationTypeInUseException,
  MagazineNotRegisteredException,
  PublicationTypeNotSupportedException
} from '../errors/magazine.errors'
import { MagazineUsageSeriesAdapter } from 'src/modules/series/adapters/magazine-usage-series.adapter'
import { MagazineUsageSurveyAdapter } from 'src/modules/survey/adapters/magazine-usage-survey.adapter'

export interface MagazineEntryOutput {
  name: string
  publicationTypes: PublicationType[]
}

@Injectable()
export class MagazineRegistryService {
  constructor(
    private readonly appConfigRepository: AppConfigRepository,
    private readonly auditService: AuditService,
    private readonly seriesAdapter: MagazineUsageSeriesAdapter,
    private readonly surveyAdapter: MagazineUsageSurveyAdapter
  ) {}

  async getMagazines(): Promise<MagazineEntryOutput[]> {
    const config = await this.appConfigRepository.findFirst()
    return config?.magazines ?? []
  }

  async getMagazine(name: string): Promise<MagazineEntryOutput | null> {
    const normalized = normalizeMagazine(name)
    const config = await this.appConfigRepository.findFirst()
    const magazines = (config?.magazines ?? []) as MagazineEntryOutput[]
    return magazines.find((m) => normalizeMagazine(m.name) === normalized) ?? null
  }

  async isRegistered(magazine: string): Promise<boolean> {
    const normalized = normalizeMagazine(magazine)
    const config = await this.appConfigRepository.findFirst()
    return ((config?.magazines ?? []) as MagazineEntryOutput[]).some((m) => normalizeMagazine(m.name) === normalized)
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
    let config = await this.appConfigRepository.findFirst()
    if (!config)
      config = await this.appConfigRepository.createDefaults({
        storyboardMaxReviewRounds: 8,
        rankingAggregateMinCoverageRatio: 0.5
      })
    const magazines = (config.magazines ?? []) as MagazineEntryOutput[]
    if (magazines.some((m) => normalizeMagazine(m.name) === normalized)) throw MagazineAlreadyExistsException
    const entry: MagazineEntryOutput = { name: normalized, publicationTypes }
    const updated = await this.appConfigRepository.update(config.id, {
      magazines: [...magazines, entry],
      updatedBy: actorId
    })
    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.APP_CONFIG,
      entityId: config.id,
      action: 'MAGAZINE_CREATE',
      reason: `Added magazine: ${normalized}`
    })
    return (
      ((updated.magazines ?? []) as MagazineEntryOutput[]).find((m) => normalizeMagazine(m.name) === normalized) ??
      entry
    )
  }

  async updateMagazine(
    name: string,
    publicationTypes: PublicationType[],
    actorId: string
  ): Promise<MagazineEntryOutput> {
    const normalized = normalizeMagazine(name)
    const config = await this.appConfigRepository.findFirst()
    if (!config) throw MagazineNotFoundException
    const magazines = (config.magazines ?? []) as MagazineEntryOutput[]
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
    magazines[idx] = { name: normalized, publicationTypes }
    await this.appConfigRepository.update(config.id, { magazines, updatedBy: actorId })
    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.APP_CONFIG,
      entityId: config.id,
      action: 'MAGAZINE_UPDATE',
      reason: `Updated magazine: ${normalized}`
    })
    return magazines[idx]
  }

  async deleteMagazine(name: string, actorId: string): Promise<void> {
    const normalized = normalizeMagazine(name)
    const config = await this.appConfigRepository.findFirst()
    if (!config) throw MagazineNotFoundException
    const magazines = (config.magazines ?? []) as MagazineEntryOutput[]
    const idx = magazines.findIndex((m) => normalizeMagazine(m.name) === normalized)
    if (idx === -1) throw MagazineNotFoundException
    const sUsage = await this.seriesAdapter.countByMagazine(normalized)
    const svUsage = await this.surveyAdapter.countByMagazine(normalized)
    if (sUsage > 0 || svUsage > 0) throw MagazineInUseException
    magazines.splice(idx, 1)
    await this.appConfigRepository.update(config.id, { magazines, updatedBy: actorId })
    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.APP_CONFIG,
      entityId: config.id,
      action: 'MAGAZINE_DELETE',
      reason: `Deleted magazine: ${normalized}`
    })
  }

  /** Gate SERIALIZATION: tên phải trong danh mục VÀ nhịp phải được tạp chí chấp nhận. Danh mục rỗng → bypass. */
  async assertSlotAllowed(magazine: string, publicationType: PublicationType): Promise<void> {
    const config = await this.appConfigRepository.findFirst()
    const entries = (config?.magazines ?? []) as MagazineEntryOutput[]
    if (entries.length === 0) return
    const normalized = normalizeMagazine(magazine)
    const current = entries.find((e) => normalizeMagazine(e.name) === normalized)
    if (!current) throw MagazineNotRegisteredException
    if (!current.publicationTypes.includes(publicationType)) throw PublicationTypeNotSupportedException
  }

  /** Gate FORMAT_CHANGE: chỉ kiểm nhịp theo magazine hiện tại. Magazine null/danh mục rỗng → bypass. */
  async assertPublicationTypeAllowed(magazine: string | null, publicationType: PublicationType): Promise<void> {
    if (!magazine) return
    const config = await this.appConfigRepository.findFirst()
    const entries = (config?.magazines ?? []) as MagazineEntryOutput[]
    if (entries.length === 0) return
    const normalized = normalizeMagazine(magazine)
    const current = entries.find((e) => normalizeMagazine(e.name) === normalized)
    if (!current) return
    if (!current.publicationTypes.includes(publicationType)) throw PublicationTypeNotSupportedException
  }
}
