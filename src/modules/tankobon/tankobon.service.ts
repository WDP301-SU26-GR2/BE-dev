import { Injectable } from '@nestjs/common'
import { AuditEntityType } from '@prisma/client'
import { AuditService } from 'src/modules/audit/audit.service'
import { RoleName } from 'src/core/security/constants/role.constant'
import { TankobonRepo } from './tankobon.repo'
import { CreateTankobonSalesBodyType } from './schemas/tankobon-schemas'
import { TankobonSeriesNotFoundException, DefenseDashboardAccessDeniedException } from './errors/tankobon.errors'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class TankobonService {
  constructor(
    private readonly repo: TankobonRepo,
    private readonly auditService: AuditService
  ) {}

  async recordSales(seriesId: string, body: CreateTankobonSalesBodyType, actorId: string) {
    if (!OBJECT_ID_RE.test(seriesId)) throw TankobonSeriesNotFoundException
    const series = await this.repo.findSeriesById(seriesId)
    if (!series) throw TankobonSeriesNotFoundException
    const created = await this.repo.createSales({
      seriesId,
      volumeNumber: body.volumeNumber,
      unitsSold: body.unitsSold,
      period: body.period,
      recordedBy: actorId
    })
    await this.auditService.record({
      actorId,
      entityType: AuditEntityType.SERIES,
      entityId: seriesId,
      action: 'TANKOBON_SALES_RECORDED',
      reason: `vol ${body.volumeNumber} / ${body.unitsSold} units / ${body.period}`
    })
    return this.toSalesRes(created)
  }

  async defenseDashboard(seriesId: string, callerId: string, roleName: string) {
    if (!OBJECT_ID_RE.test(seriesId)) throw TankobonSeriesNotFoundException
    const series = await this.repo.findSeriesById(seriesId)
    if (!series) throw TankobonSeriesNotFoundException
    // Defense dashboard = editor/board tool. Mangaka has own ranking view (PB-04).
    const isBoardOrAdmin = roleName === RoleName.BOARD_MEMBER || roleName === RoleName.SUPER_ADMIN
    const isAssignedEditor = roleName === RoleName.EDITOR && series.editorId === callerId
    if (!isBoardOrAdmin && !isAssignedEditor) throw DefenseDashboardAccessDeniedException

    const [trend, sales, reports, chaptersPublished] = await Promise.all([
      this.repo.findRankingTrend(seriesId, 12),
      this.repo.findSalesBySeries(seriesId),
      this.repo.findSeriesReports(seriesId),
      this.repo.countPublishedChapters(seriesId)
    ])
    const totalUnitsSold = sales.reduce((sum, s) => sum + s.unitsSold, 0)
    const serializedSince = this.readSerializedSince(series)
    return {
      seriesId,
      rankingTrend: trend.map((r) => ({
        surveyPeriodId: r.surveyPeriodId,
        rankPosition: r.rankPosition ?? null,
        voteCount: r.voteCount,
        previousRank: r.previousRank ?? null,
        rankChange: r.rankChange ?? null,
        isAtRisk: r.isAtRisk,
        riskLevel: r.riskLevel,
        recordedAt: r.recordedAt.toISOString()
      })),
      tankobon: {
        totalUnitsSold,
        volumes: sales.map((s) => ({ volumeNumber: s.volumeNumber, unitsSold: s.unitsSold, period: s.period }))
      },
      seriesReports: reports.map((r) => ({
        id: r.id,
        reportType: r.reportType ?? null,
        content: r.content ?? null,
        createdAt: r.createdAt.toISOString()
      })),
      serialization: { serializedSince, chaptersPublished }
    }
  }

  private toSalesRes(s: {
    id: string
    seriesId: string
    volumeNumber: number
    unitsSold: number
    period: string
    recordedBy: string
    createdAt: Date
  }) {
    return { ...s, createdAt: s.createdAt.toISOString() }
  }

  private readSerializedSince(series: {
    statusHistory?: Array<{ toStatus?: string; changedAt?: Date }> | null
  }): string | null {
    const hist = series.statusHistory ?? []
    const entry = [...hist].reverse().find((h) => h.toStatus === 'SERIALIZED')
    return entry?.changedAt ? new Date(entry.changedAt).toISOString() : null
  }
}
