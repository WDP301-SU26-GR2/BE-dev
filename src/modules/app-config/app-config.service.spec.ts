import { AuditEntityType } from '@prisma/client'
import { AppConfigService } from './app-config.service'

const row = {
  id: '507f1f77bcf86cd799439011',
  updatedBy: null,
  coOwnerApprovalGraceDays: 7,
  storyboardMaxReviewRounds: 8,
  reputationRecommendThreshold: 4,
  hiatusTooLongDays: 30,
  lowVoteReliabilityThreshold: 10,
  rankingAggregateMinCoverageRatio: 0.5,
  maxUploadBytes: 15728640,
  assignmentGraceDays: 0,
  updatedAt: new Date('2026-06-23T00:00:00.000Z')
}

function make() {
  const repo = {
    findFirst: jest.fn().mockResolvedValue(row),
    createDefaults: jest.fn().mockResolvedValue(row),
    // Bản cache có thể trỏ document đã biến mất — service xác thực lại trước khi update.
    existsById: jest.fn().mockResolvedValue(true),
    update: jest.fn().mockResolvedValue({ ...row, storyboardMaxReviewRounds: 10 })
  }
  const auditService = { record: jest.fn().mockResolvedValue(undefined) }
  const service = new AppConfigService(repo as never, auditService as never)
  return { service, repo, auditService }
}

describe('AppConfigService', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-06-23T00:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('lazy seeds defaults when no config exists', async () => {
    const { service, repo } = make()
    repo.findFirst.mockResolvedValueOnce(null)

    const res = await service.get()

    expect(repo.createDefaults).toHaveBeenCalledWith({
      storyboardMaxReviewRounds: 8,
      rankingAggregateMinCoverageRatio: 0.5
    })
    expect(res.id).toBe(row.id)
  })

  it('returns cached config for 30 seconds', async () => {
    const { service, repo } = make()

    await service.get()
    await service.get()
    jest.advanceTimersByTime(30001)
    await service.get()

    expect(repo.findFirst).toHaveBeenCalledTimes(2)
  })

  it('updates changed fields, invalidates cache, and audits changed keys', async () => {
    const { service, repo, auditService } = make()

    const res = await service.update('admin1', { storyboardMaxReviewRounds: 10, maxUploadBytes: null })

    expect(repo.update).toHaveBeenCalledWith(row.id, { storyboardMaxReviewRounds: 10, updatedBy: 'admin1' })
    expect(res.storyboardMaxReviewRounds).toBe(10)
    expect(auditService.record).toHaveBeenCalledWith({
      actorId: 'admin1',
      entityType: AuditEntityType.APP_CONFIG,
      entityId: row.id,
      action: 'CONFIG_UPDATE',
      reason: 'storyboardMaxReviewRounds: 8 -> 10'
    })

    repo.findFirst.mockResolvedValueOnce({ ...row, storyboardMaxReviewRounds: 10 })
    await service.get()
    expect(repo.findFirst).toHaveBeenCalledTimes(2)
  })

  it('does not write or audit when patch is a no-op', async () => {
    const { service, repo, auditService } = make()

    const res = await service.update('admin1', { storyboardMaxReviewRounds: 8, maxUploadBytes: null })

    expect(res.storyboardMaxReviewRounds).toBe(8)
    expect(repo.update).not.toHaveBeenCalled()
    expect(auditService.record).not.toHaveBeenCalled()
  })

  it('làm mới bản cache khi document trong cache đã biến mất, thay vì update theo id chết', async () => {
    const { service, repo } = make()
    // Nạp cache trước để service có sẵn một row (kèm id) trong bộ nhớ.
    await service.get()
    // Document bị xoá ngoài tiến trình này → lần update sau phải đọc lại thay vì ném lỗi id không tồn tại.
    repo.existsById.mockResolvedValueOnce(false)

    await service.update('admin1', { storyboardMaxReviewRounds: 10 })

    expect(repo.existsById).toHaveBeenCalledWith(row.id)
    // findFirst gọi lại lần nữa sau khi cache bị xoá (lần đầu do service.get()).
    expect(repo.findFirst.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(repo.update).toHaveBeenCalled()
  })

  it('updates the aggregate coverage ratio as an additive app configuration key', async () => {
    const { service, repo, auditService } = make()
    repo.update.mockResolvedValueOnce({ ...row, rankingAggregateMinCoverageRatio: 0.75 })

    const res = await service.update('admin1', { rankingAggregateMinCoverageRatio: 0.75 })

    expect(repo.update).toHaveBeenCalledWith(row.id, { rankingAggregateMinCoverageRatio: 0.75, updatedBy: 'admin1' })
    expect(res.rankingAggregateMinCoverageRatio).toBe(0.75)
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'rankingAggregateMinCoverageRatio: 0.5 -> 0.75' })
    )
  })
})
