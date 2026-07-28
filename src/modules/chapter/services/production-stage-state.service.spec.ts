import { ProductionStageStatus } from '@prisma/client'
import {
  FinalCheckNotCompletableException,
  StageHasOpenTasksException,
  StageNotActiveException,
  StageNotFoundException,
  StageNotReopenableException,
  StageOutputNotReadyException
} from '../errors/production-stage.errors'
import { ProductionStageStateService } from './production-stage-state.service'

const createRepo = (overrides: Record<string, unknown> = {}) => ({
  countByChapter: jest.fn().mockResolvedValue(0),
  seedStagesAndFirstInputs: jest.fn().mockResolvedValue(undefined),
  findById: jest.fn(),
  countTasksByStage: jest.fn().mockResolvedValue(0),
  findStagePages: jest.fn().mockResolvedValue([]),
  countPagesByChapter: jest.fn().mockResolvedValue(0),
  findByChapter: jest.fn().mockResolvedValue([]),
  completeAndOpenNext: jest.fn().mockResolvedValue(undefined),
  reopenStageAndRelockAfter: jest.fn().mockResolvedValue({ clearedStagePages: 0 }),
  findFinalCheck: jest.fn(),
  updateStatus: jest.fn(),
  ...overrides
})

describe('ProductionStageStateService', () => {
  it('seeds stage one ACTIVE and is idempotent', async () => {
    const repo = createRepo()
    const service = new ProductionStageStateService(repo as never, { record: jest.fn() } as never)
    await service.seedForChapter('c1')
    const rows = repo.seedStagesAndFirstInputs.mock.calls[0][1]
    expect(rows).toHaveLength(4)
    expect(rows[0]).toMatchObject({ status: ProductionStageStatus.ACTIVE, name: 'INKING' })
    expect(rows[3]).toMatchObject({ isFinalCheck: true })
  })

  it('enforces ACTIVE, no open tasks and confirmed outputs before completion', async () => {
    const locked = createRepo({
      findById: jest.fn().mockResolvedValue({ id: 's1', chapterId: 'c1', status: 'LOCKED' })
    })
    await expect(
      new ProductionStageStateService(locked as never, { record: jest.fn() } as never).completeStage('c1', 's1', 'u1')
    ).rejects.toBe(StageNotActiveException)
    const open = createRepo({
      findById: jest.fn().mockResolvedValue({ id: 's1', chapterId: 'c1', status: 'ACTIVE' }),
      countTasksByStage: jest.fn().mockResolvedValue(1)
    })
    await expect(
      new ProductionStageStateService(open as never, { record: jest.fn() } as never).completeStage('c1', 's1', 'u1')
    ).rejects.toBe(StageHasOpenTasksException)
    const outputs = createRepo({
      findById: jest.fn().mockResolvedValue({ id: 's1', chapterId: 'c1', status: 'ACTIVE' }),
      findStagePages: jest.fn().mockResolvedValue([{ outputConfirmedAt: null }]),
      countPagesByChapter: jest.fn().mockResolvedValue(1)
    })
    await expect(
      new ProductionStageStateService(outputs as never, { record: jest.fn() } as never).completeStage('c1', 's1', 'u1')
    ).rejects.toBe(StageOutputNotReadyException)
  })

  it('refuses to complete FINAL_CHECK through the complete route', async () => {
    const repo = createRepo({
      findById: jest.fn().mockResolvedValue({
        id: 's4',
        chapterId: 'c1',
        order: 4,
        name: 'FINAL_CHECK',
        isFinalCheck: true,
        status: ProductionStageStatus.ACTIVE
      })
    })
    const service = new ProductionStageStateService(repo as never, { record: jest.fn() } as never)

    await expect(service.completeStage('c1', 's4', 'actor1')).rejects.toBe(FinalCheckNotCompletableException)
    expect(repo.completeAndOpenNext).not.toHaveBeenCalled()
    expect(repo.findStagePages).not.toHaveBeenCalled()
  })

  describe('reopenStage', () => {
    const stages = [
      {
        id: 's1',
        chapterId: 'c1',
        order: 1,
        name: 'INKING',
        status: ProductionStageStatus.COMPLETED,
        isFinalCheck: false
      },
      {
        id: 's2',
        chapterId: 'c1',
        order: 2,
        name: 'DETAILING',
        status: ProductionStageStatus.COMPLETED,
        isFinalCheck: false
      },
      {
        id: 's3',
        chapterId: 'c1',
        order: 3,
        name: 'LETTERING',
        status: ProductionStageStatus.COMPLETED,
        isFinalCheck: false
      },
      {
        id: 's4',
        chapterId: 'c1',
        order: 4,
        name: 'FINAL_CHECK',
        status: ProductionStageStatus.COMPLETED,
        isFinalCheck: true
      }
    ]

    const build = (overrides: Record<string, unknown> = {}) => {
      const repo = createRepo({
        findByChapter: jest.fn().mockResolvedValue(stages),
        countTasksByStage: jest.fn().mockResolvedValue(0),
        reopenStageAndRelockAfter: jest.fn().mockResolvedValue({ clearedStagePages: 4 }),
        ...overrides
      })
      const audit = { record: jest.fn().mockResolvedValue(undefined) }
      return { repo, audit, service: new ProductionStageStateService(repo as never, audit as never) }
    }

    it('relocks every stage after the reopened one', async () => {
      const { repo, service } = build()
      const result = await service.reopenStage('c1', 's2', 'actor1')

      expect(repo.reopenStageAndRelockAfter).toHaveBeenCalledWith('s2', ['s3', 's4'], expect.any(Date))
      expect(result).toEqual({ stageId: 's2', relockedStageIds: ['s3', 's4'], clearedStagePages: 4 })
    })

    it('reopens the last stage without relocking anything', async () => {
      const { repo, service } = build()
      const result = await service.reopenStage('c1', 's4', 'actor1')

      expect(repo.reopenStageAndRelockAfter).toHaveBeenCalledWith('s4', [], expect.any(Date))
      expect(result.relockedStageIds).toEqual([])
    })

    it('rejects a stage that does not belong to the chapter', async () => {
      const { service } = build()
      await expect(service.reopenStage('c1', 'nope', 'actor1')).rejects.toBe(StageNotFoundException)
    })

    it.each([ProductionStageStatus.LOCKED, ProductionStageStatus.ACTIVE])('rejects a %s stage', async (status) => {
      const { service } = build({
        findByChapter: jest
          .fn()
          .mockResolvedValue(stages.map((stage) => (stage.id === 's3' ? { ...stage, status } : stage)))
      })
      await expect(service.reopenStage('c1', 's3', 'actor1')).rejects.toBe(StageNotReopenableException)
    })

    it('rejects when any stage at or after the target still has open tasks', async () => {
      const { service } = build({
        countTasksByStage: jest.fn((stageId: string) => Promise.resolve(stageId === 's4' ? 1 : 0))
      })
      await expect(service.reopenStage('c1', 's2', 'actor1')).rejects.toBe(StageHasOpenTasksException)
    })

    it('does not inspect open tasks of stages before the target', async () => {
      const { repo, service } = build()
      await service.reopenStage('c1', 's3', 'actor1')

      const inspected = repo.countTasksByStage.mock.calls.map((call: unknown[]) => call[0])
      expect(inspected).toEqual(['s3', 's4'])
    })

    it('records the audit trail after the write', async () => {
      const { audit, service } = build()
      await service.reopenStage('c1', 's2', 'actor1')

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'actor1',
          entityType: 'CHAPTER',
          entityId: 'c1',
          action: 'PRODUCTION_STAGE_REOPEN',
          fromState: ProductionStageStatus.COMPLETED,
          toState: ProductionStageStatus.ACTIVE
        })
      )
    })
  })
})
