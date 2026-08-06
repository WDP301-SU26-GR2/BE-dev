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
  'storyboardMaxReviewRounds',
  'reputationRecommendThreshold',
  'hiatusTooLongDays',
  'lowVoteReliabilityThreshold',
  'rankingAggregateMinCoverageRatio',
  'maxUploadBytes',
  'assignmentGraceDays',
  'boardRepClaimGraceDays',
  'taskOverdueGraceHours'
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
    let current = await this.getRow()
    // Bản cache 30s có thể trỏ tới document đã biến mất (bị xoá/tạo lại ngoài tiến trình này).
    // Không xác thực lại thì `update` theo id cũ ném P2025 → 500 cho một thao tác lẽ ra vô hại.
    if (!(await this.appConfigRepository.existsById(current.id))) {
      this.cached = null
      current = await this.getRow()
    }
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

  // Danh mục tạp chí lưu ở field `magazines[]` của AppConfig singleton. AppConfig SỞ HỮU document,
  // nên nó expose accessor cho MagazineModule dùng (qua service — không xuyên repo, giữ boundary AGENTS §5).
  async getMagazines(): Promise<AppConfig['magazines']> {
    return (await this.getRow()).magazines ?? []
  }

  async replaceMagazines(
    magazines: AppConfig['magazines'],
    actorId: string
  ): Promise<{ configId: string; magazines: AppConfig['magazines'] }> {
    let current = await this.getRow()
    if (!(await this.appConfigRepository.existsById(current.id))) {
      this.cached = null
      current = await this.getRow()
    }
    const updated = await this.appConfigRepository.update(current.id, { magazines, updatedBy: actorId })
    this.cached = null
    return { configId: current.id, magazines: updated.magazines ?? [] }
  }

  private async getRow(): Promise<AppConfig> {
    const now = Date.now()
    if (this.cached && this.cached.expiresAt > now) return this.cached.row

    const row =
      (await this.appConfigRepository.findFirst()) ??
      (await this.appConfigRepository.createDefaults({
        storyboardMaxReviewRounds: envConfig.STORYBOARD_MAX_REVIEW_ROUNDS,
        rankingAggregateMinCoverageRatio: 0.5
      }))
    this.cached = { row, expiresAt: now + CACHE_TTL_MS }
    return row
  }
}
