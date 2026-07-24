import { ProductionStageStatus } from '@prisma/client'
import {
  StageHasOpenTasksException,
  StageNotActiveException,
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
})
