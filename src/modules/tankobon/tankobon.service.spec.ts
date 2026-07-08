import { Test } from '@nestjs/testing'
import { TankobonService } from './tankobon.service'
import { TankobonRepo } from './tankobon.repo'
import { AuditService } from 'src/modules/audit/audit.service'
import { RoleName } from 'src/core/security/constants/role.constant'

const makeRepo = () => ({
  findSeriesById: jest.fn(),
  createSales: jest.fn(),
  findSalesBySeries: jest.fn(),
  findRankingTrend: jest.fn(),
  findSeriesReports: jest.fn(),
  countPublishedChapters: jest.fn()
})
const makeAudit = () => ({ record: jest.fn().mockResolvedValue(undefined) })

async function build(repo: any, audit: any) {
  const mod = await Test.createTestingModule({
    providers: [TankobonService, { provide: TankobonRepo, useValue: repo }, { provide: AuditService, useValue: audit }]
  }).compile()
  return mod.get(TankobonService)
}

describe('TankobonService.recordSales', () => {
  it('malformed seriesId → SeriesNotFound (no 500)', async () => {
    const repo = makeRepo()
    const svc = await build(repo, makeAudit())
    await expect(
      svc.recordSales('garbage', { seriesId: 'garbage', volumeNumber: 1, unitsSold: 10, period: '2026-Q2' } as any)
    ).rejects.toMatchObject({ status: 404 })
    expect(repo.findSeriesById).not.toHaveBeenCalled()
  })

  it('series not found → 404', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue(null)
    const svc = await build(repo, makeAudit())
    await expect(
      svc.recordSales('012345678901234567890123', {
        seriesId: '012345678901234567890123',
        volumeNumber: 1,
        unitsSold: 10,
        period: 'p'
      } as any)
    ).rejects.toMatchObject({ status: 404 })
  })

  it('valid → creates record + audit', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: '012345678901234567890123' })
    repo.createSales.mockResolvedValue({
      id: 's1',
      seriesId: '012345678901234567890123',
      volumeNumber: 1,
      unitsSold: 10,
      period: 'p',
      recordedBy: 'u1',
      createdAt: new Date()
    })
    const audit = makeAudit()
    const svc = await build(repo, audit)
    const out = await svc.recordSales(
      '012345678901234567890123',
      { seriesId: '012345678901234567890123', volumeNumber: 1, unitsSold: 10, period: 'p' },
      'u1'
    )
    expect(out.id).toBe('s1')
    expect(audit.record).toHaveBeenCalled()
  })
})

describe('TankobonService.defenseDashboard scoping', () => {
  const seriesId = '012345678901234567890123'
  it('Mangaka → 403 (defense dashboard is editor/board only)', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: seriesId, editorId: 'e1', mangakaId: 'm1' })
    const svc = await build(repo, makeAudit())
    await expect(svc.defenseDashboard(seriesId, 'm1', RoleName.MANGAKA)).rejects.toMatchObject({ status: 403 })
  })

  it('assigned Editor → aggregates', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: seriesId, editorId: 'e1', mangakaId: 'm1', statusHistory: [] })
    repo.findRankingTrend.mockResolvedValue([])
    repo.findSalesBySeries.mockResolvedValue([{ volumeNumber: 1, unitsSold: 100, period: 'p' }])
    repo.findSeriesReports.mockResolvedValue([])
    repo.countPublishedChapters.mockResolvedValue(12)
    const svc = await build(repo, makeAudit())
    const out = await svc.defenseDashboard(seriesId, 'e1', RoleName.EDITOR)
    expect(out.tankobon.totalUnitsSold).toBe(100)
    expect(out.serialization.chaptersPublished).toBe(12)
  })

  it('non-assigned Editor → 403', async () => {
    const repo = makeRepo()
    repo.findSeriesById.mockResolvedValue({ id: seriesId, editorId: 'e1', mangakaId: 'm1' })
    const svc = await build(repo, makeAudit())
    await expect(svc.defenseDashboard(seriesId, 'eX', RoleName.EDITOR)).rejects.toMatchObject({ status: 403 })
  })
})
