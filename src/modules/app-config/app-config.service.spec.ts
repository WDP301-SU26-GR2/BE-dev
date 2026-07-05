import { AuditEntityType } from '@prisma/client'
import { AppConfigService } from './app-config.service'

const row = {
  id: '507f1f77bcf86cd799439011',
  updatedBy: null,
  coOwnerApprovalGraceDays: 7,
  nameMaxReviewRounds: 8,
  reputationRecommendThreshold: 4,
  hiatusTooLongDays: 30,
  lowVoteReliabilityThreshold: 10,
  maxUploadBytes: 15728640,
  assignmentGraceDays: 0,
  updatedAt: new Date('2026-06-23T00:00:00.000Z')
}

function make() {
  const repo = {
    findFirst: jest.fn().mockResolvedValue(row),
    createDefaults: jest.fn().mockResolvedValue(row),
    update: jest.fn().mockResolvedValue({ ...row, nameMaxReviewRounds: 10 })
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

    expect(repo.createDefaults).toHaveBeenCalledWith({ nameMaxReviewRounds: 8 })
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

    const res = await service.update('admin1', { nameMaxReviewRounds: 10, maxUploadBytes: null })

    expect(repo.update).toHaveBeenCalledWith(row.id, { nameMaxReviewRounds: 10, updatedBy: 'admin1' })
    expect(res.nameMaxReviewRounds).toBe(10)
    expect(auditService.record).toHaveBeenCalledWith({
      actorId: 'admin1',
      entityType: AuditEntityType.APP_CONFIG,
      entityId: row.id,
      action: 'CONFIG_UPDATE',
      reason: 'nameMaxReviewRounds: 8 -> 10'
    })

    repo.findFirst.mockResolvedValueOnce({ ...row, nameMaxReviewRounds: 10 })
    await service.get()
    expect(repo.findFirst).toHaveBeenCalledTimes(2)
  })

  it('does not write or audit when patch is a no-op', async () => {
    const { service, repo, auditService } = make()

    const res = await service.update('admin1', { nameMaxReviewRounds: 8, maxUploadBytes: null })

    expect(res.nameMaxReviewRounds).toBe(8)
    expect(repo.update).not.toHaveBeenCalled()
    expect(auditService.record).not.toHaveBeenCalled()
  })
})
