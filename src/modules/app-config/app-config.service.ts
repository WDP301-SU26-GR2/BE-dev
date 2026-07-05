import { Injectable } from '@nestjs/common'
import { AppConfig, AuditEntityType } from '@prisma/client'
import envConfig from 'src/core/config/envConfig'
import { AuditService } from 'src/modules/audit/audit.service'
import { toAppConfigRes } from './app-config.mapper'
import { AppConfigRepository } from './app-config.repo'
import { AppConfigResType, PatchAppConfigBodyType } from './schemas/app-config-schemas'

const CACHE_TTL_MS = 30_000

const CONFIG_KEYS = [
  'coOwnerApprovalGraceDays',
  'nameMaxReviewRounds',
  'reputationRecommendThreshold',
  'hiatusTooLongDays',
  'lowVoteReliabilityThreshold',
  'maxUploadBytes',
  'assignmentGraceDays'
] as const

type ConfigKey = (typeof CONFIG_KEYS)[number]

@Injectable()
export class AppConfigService {
  private cached: { row: AppConfig; expiresAt: number } | null = null

  constructor(
    private readonly appConfigRepository: AppConfigRepository,
    private readonly auditService: AuditService
  ) {}

  async get(): Promise<AppConfigResType> {
    return toAppConfigRes(await this.getRow())
  }

  async update(adminId: string, patch: PatchAppConfigBodyType): Promise<AppConfigResType> {
    const current = await this.getRow()
    const data: Partial<Record<ConfigKey, number>> & { updatedBy?: string } = {}
    const changes: string[] = []

    for (const key of CONFIG_KEYS) {
      const next = patch[key]
      if (next == null || next === current[key]) continue
      data[key] = next
      changes.push(`${key}: ${current[key]} -> ${next}`)
    }

    if (changes.length === 0) return toAppConfigRes(current)

    data.updatedBy = adminId
    const updated = await this.appConfigRepository.update(current.id, data)
    this.cached = null
    await this.auditService.record({
      actorId: adminId,
      entityType: AuditEntityType.APP_CONFIG,
      entityId: current.id,
      action: 'CONFIG_UPDATE',
      reason: changes.join(', ')
    })
    return toAppConfigRes(updated)
  }

  private async getRow(): Promise<AppConfig> {
    const now = Date.now()
    if (this.cached && this.cached.expiresAt > now) return this.cached.row

    const row =
      (await this.appConfigRepository.findFirst()) ??
      (await this.appConfigRepository.createDefaults({ nameMaxReviewRounds: envConfig.NAME_MAX_REVIEW_ROUNDS }))
    this.cached = { row, expiresAt: now + CACHE_TTL_MS }
    return row
  }
}
