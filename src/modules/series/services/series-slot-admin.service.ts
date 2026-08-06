import { Injectable } from '@nestjs/common'
import { AuditEntityType, PublicationType, SeriesStatus } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { MagazineRegistryService } from 'src/modules/app-config/services/magazine-registry.service'
import { normalizeMagazine } from 'src/core/http/schemas/magazine.schema'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { SeriesQueryRepository } from '../repositories/series-query.repository'
import { SeriesRepository } from '../series.repo'
import { SeriesSlotNotEditableException, SeriesNotFoundException } from '../errors/series.errors'

const SLOT_EDITABLE_STATUSES: SeriesStatus[] = [
  SeriesStatus.SERIALIZED,
  SeriesStatus.HIATUS,
  SeriesStatus.COMPLETING,
  SeriesStatus.CANCELLING
]

@Injectable()
export class SeriesSlotAdminService {
  constructor(
    private readonly seriesQueryRepository: SeriesQueryRepository,
    private readonly seriesRepository: SeriesRepository,
    private readonly magazineRegistryService: MagazineRegistryService,
    private readonly auditService: AuditService
  ) {}

  async updateSlot(
    seriesId: string,
    dto: { magazine?: string; startIssueNumber?: number; publicationType?: PublicationType },
    actorId: string
  ): Promise<void> {
    // AGENTS §10: id rác (không 24-hex) → Prisma P2023 → 500. Guard trước khi query → 404 sạch.
    if (!isObjectId(seriesId)) throw SeriesNotFoundException
    const series = await this.seriesQueryRepository.findById(seriesId)
    if (!series) {
      throw SeriesNotFoundException
    }

    if (!SLOT_EDITABLE_STATUSES.includes(series.status)) {
      throw SeriesSlotNotEditableException
    }

    const data: { magazine?: string; startIssueNumber?: number; publicationType?: PublicationType } = {}

    // Nhịp hiệu lực để kiểm gate = nhịp mới (nếu gửi) hoặc nhịp hiện tại của series (không mặc định WEEKLY).
    const effectivePubType = dto.publicationType ?? series.publicationType ?? PublicationType.WEEKLY

    if (dto.magazine !== undefined) {
      data.magazine = normalizeMagazine(dto.magazine)
      // Đổi tạp chí → kiểm cả tên ∈ registry và nhịp hiệu lực được tạp chí chấp nhận.
      await this.magazineRegistryService.assertSlotAllowed(data.magazine, effectivePubType)
    } else if (dto.publicationType !== undefined && series.magazine) {
      // Chỉ đổi nhịp trên tạp chí hiện tại → chỉ kiểm nhịp.
      await this.magazineRegistryService.assertPublicationTypeAllowed(series.magazine, effectivePubType)
    }

    if (dto.startIssueNumber !== undefined) data.startIssueNumber = dto.startIssueNumber
    if (dto.publicationType !== undefined) data.publicationType = dto.publicationType

    await this.seriesRepository.updateSerializationSlot(seriesId, {
      magazine: data.magazine ?? series.magazine ?? '',
      startIssueNumber: data.startIssueNumber ?? series.startIssueNumber ?? 1,
      publicationType: data.publicationType ?? series.publicationType ?? PublicationType.WEEKLY
    })

    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.SERIES,
      entityId: seriesId,
      action: 'SLOT_CORRECTED',
      reason: `Slot corrected: ${JSON.stringify(dto)}`
    })
  }
}
