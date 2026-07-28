import { AiSegmentSource, ProductionStageStatus } from '@prisma/client'
import { ProductionStageRepository } from './production-stage.repo'

const chapterId = '0123456789abcdef01234567'
const stageId = 'fedcba987654321001234567'
const pageId = 'aaaaaaaaaaaaaaaaaaaaaaaa'

const createFixture = () => {
  const tx = {
    productionStage: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn()
    },
    productionStagePage: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn()
    },
    page: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn()
    }
  }
  const prisma = {
    productionStage: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn()
    },
    task: { count: jest.fn(), findMany: jest.fn() },
    page: { count: jest.fn(), findMany: jest.fn() },
    productionStagePage: { findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx))
  }
  return { tx, prisma, repo: new ProductionStageRepository(prisma as never) }
}

describe('ProductionStageRepository workflow persistence', () => {
  it.each([
    [ProductionStageStatus.ACTIVE, { status: ProductionStageStatus.ACTIVE, startedAt: expect.any(Date) }],
    [ProductionStageStatus.COMPLETED, { status: ProductionStageStatus.COMPLETED, completedAt: expect.any(Date) }],
    [ProductionStageStatus.LOCKED, { status: ProductionStageStatus.LOCKED }]
  ])('writes timestamps appropriate for %s transition', async (status, expectedData) => {
    const { prisma, repo } = createFixture()
    const at = new Date('2026-07-01T00:00:00.000Z')
    await repo.updateStatus(stageId, status, at)
    expect(prisma.productionStage.update).toHaveBeenCalledWith({
      where: { id: stageId },
      data: { ...expectedData, ...(status === ProductionStageStatus.ACTIVE ? { startedAt: at } : {}) }
    })
  })

  it('returns no analytics query when a chapter has no pages', async () => {
    const { prisma, repo } = createFixture()
    prisma.page.findMany.mockResolvedValue([])
    await expect(repo.findTasksForStageAnalytics(chapterId)).resolves.toEqual([])
    expect(prisma.task.findMany).not.toHaveBeenCalled()
  })

  it('scopes analytics tasks to stage-bound pages from the chapter', async () => {
    const { prisma, repo } = createFixture()
    prisma.page.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }])
    prisma.task.findMany.mockResolvedValue([{ id: 't1' }])
    await expect(repo.findTasksForStageAnalytics(chapterId)).resolves.toEqual([{ id: 't1' }])
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stageId: { isSet: true }, pageId: { in: ['p1', 'p2'] } }
      })
    )
  })

  describe('seedStagesAndFirstInputs', () => {
    const rows = [
      {
        chapterId,
        order: 1,
        name: 'INKING',
        taskTypes: [],
        isFinalCheck: false,
        status: ProductionStageStatus.ACTIVE
      },
      {
        chapterId,
        order: 2,
        name: 'COLORING',
        taskTypes: [],
        isFinalCheck: false,
        status: ProductionStageStatus.LOCKED
      }
    ]

    it('is transactionally idempotent when stages already exist', async () => {
      const { tx, repo } = createFixture()
      tx.productionStage.count.mockResolvedValue(1)
      await repo.seedStagesAndFirstInputs(chapterId, rows)
      expect(tx.productionStage.create).not.toHaveBeenCalled()
    })

    it('does not seed inputs if the template has no first stage', async () => {
      const { tx, repo } = createFixture()
      tx.productionStage.count.mockResolvedValue(0)
      tx.productionStage.create.mockImplementation(({ data }: { data: { order: number } }) =>
        Promise.resolve({
          id: `s${data.order}`,
          ...data
        })
      )
      await repo.seedStagesAndFirstInputs(chapterId, [{ ...rows[0], order: 2 }])
      expect(tx.page.findMany).not.toHaveBeenCalled()
    })

    it('aborts first-stage inputs if any page lacks an original file', async () => {
      const { tx, repo } = createFixture()
      tx.productionStage.count.mockResolvedValue(0)
      tx.productionStage.create.mockImplementation(({ data }: { data: { order: number } }) =>
        Promise.resolve({
          id: `s${data.order}`,
          ...data
        })
      )
      tx.page.findMany.mockResolvedValue([
        { id: 'p1', originalFile: 'one.png' },
        { id: 'p2', originalFile: null }
      ])
      await repo.seedStagesAndFirstInputs(chapterId, rows)
      expect(tx.productionStagePage.createMany).not.toHaveBeenCalled()
    })

    it.each([
      [[], false],
      [[{ id: pageId, originalFile: 'one.png' }], true]
    ])('seeds the first-stage input set for complete source pages', async (pages, shouldWrite) => {
      const { tx, repo } = createFixture()
      tx.productionStage.count.mockResolvedValue(0)
      tx.productionStage.create.mockImplementation(({ data }: { data: { order: number } }) =>
        Promise.resolve({
          id: `s${data.order}`,
          ...data
        })
      )
      tx.page.findMany.mockResolvedValue(pages)
      await repo.seedStagesAndFirstInputs(chapterId, rows)
      if (shouldWrite) {
        expect(tx.productionStagePage.createMany).toHaveBeenCalledWith({
          data: [
            {
              stageId: 's1',
              pageId,
              inputSourceType: AiSegmentSource.ORIGINAL,
              inputFileKey: 'one.png',
              inputRevision: 1
            }
          ]
        })
      } else {
        expect(tx.productionStagePage.createMany).not.toHaveBeenCalled()
      }
    })
  })

  it.each([
    [null, false],
    [{ id: stageId }, true]
  ])('creates a page and conditionally registers its first stage input', async (first, shouldWrite) => {
    const { tx, repo } = createFixture()
    tx.page.create.mockResolvedValue({ id: pageId })
    tx.productionStage.findFirst.mockResolvedValue(first)
    await expect(
      repo.createPageWithFirstStageInput(chapterId, { pageNumber: 1, originalFile: 'one.png' })
    ).resolves.toEqual({ id: pageId })
    expect(tx.productionStagePage.create).toHaveBeenCalledTimes(shouldWrite ? 1 : 0)
    if (shouldWrite) {
      expect(tx.productionStagePage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ stageId, pageId, inputSourceType: AiSegmentSource.ORIGINAL })
      })
    }
  })

  it('completes the terminal stage atomically without opening a successor', async () => {
    const { tx, repo } = createFixture()
    const at = new Date('2026-07-01T00:00:00.000Z')
    await repo.completeAndOpenNext({ id: stageId, chapterId }, null, [], at)
    expect(tx.productionStage.update).toHaveBeenCalledWith({
      where: { id: stageId },
      data: { status: ProductionStageStatus.COMPLETED, completedAt: at }
    })
    expect(tx.productionStagePage.createMany).not.toHaveBeenCalled()
  })

  it('atomically carries confirmed output revisions into the next active stage', async () => {
    const { tx, repo } = createFixture()
    const at = new Date('2026-07-01T00:00:00.000Z')
    await repo.completeAndOpenNext(
      { id: stageId, chapterId },
      { id: 'next' },
      [
        {
          pageId,
          outputSourceType: AiSegmentSource.COMPOSITE,
          outputFileKey: 'out.png',
          outputRevision: 2
        }
      ],
      at
    )
    expect(tx.productionStagePage.createMany).toHaveBeenCalledWith({
      data: [
        {
          stageId: 'next',
          pageId,
          inputSourceType: AiSegmentSource.COMPOSITE,
          inputFileKey: 'out.png',
          inputRevision: 2
        }
      ]
    })
    expect(tx.productionStage.update).toHaveBeenLastCalledWith({
      where: { id: 'next' },
      data: { status: ProductionStageStatus.ACTIVE, startedAt: at }
    })
  })

  describe('reopenStageAndRelockAfter', () => {
    it('reopens the target stage, relocks later stages and deletes their stage pages', async () => {
      const { tx, repo } = createFixture()
      const now = new Date('2026-07-28T00:00:00.000Z')
      tx.productionStagePage.deleteMany.mockResolvedValue({ count: 7 })

      const result = await repo.reopenStageAndRelockAfter('stage3', ['stage4', 'stage5'], now)

      expect(tx.productionStage.update).toHaveBeenCalledWith({
        where: { id: 'stage3' },
        data: { status: ProductionStageStatus.ACTIVE, startedAt: now, completedAt: null }
      })
      // 🔴 Chỉ xoá DẤU XÁC NHẬN, GIỮ giá trị output cũ.
      // Xoá luôn outputFileKey làm mất vĩnh viễn kết quả của stage này: StagePage của các stage sau
      // đã bị xoá ở cùng transaction, nên không còn bản sao nào ⇒ FE không thể cho Mangaka "giữ nguyên
      // kết quả cũ" cho trang không cần sửa, và stage kế tiếp nhận input tụt về ảnh trước-stage.
      expect(tx.productionStagePage.updateMany).toHaveBeenCalledWith({
        where: { stageId: 'stage3' },
        data: { outputConfirmedAt: null, outputConfirmedBy: null }
      })
      expect(tx.productionStage.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['stage4', 'stage5'] } },
        data: { status: ProductionStageStatus.LOCKED, startedAt: null, completedAt: null }
      })
      expect(tx.productionStagePage.deleteMany).toHaveBeenCalledWith({
        where: { stageId: { in: ['stage4', 'stage5'] } }
      })
      expect(result).toEqual({ clearedStagePages: 7 })
    })

    it('never touches input snapshot fields of the reopened stage', async () => {
      const { tx, repo } = createFixture()
      await repo.reopenStageAndRelockAfter('stage1', [], new Date())

      const data = tx.productionStagePage.updateMany.mock.calls[0][0].data
      expect(data).not.toHaveProperty('inputFileKey')
      expect(data).not.toHaveProperty('inputRevision')
      expect(data).not.toHaveProperty('inputSourceType')
    })

    it('preserves the previous output values so the old result stays readable', async () => {
      const { tx, repo } = createFixture()
      await repo.reopenStageAndRelockAfter('stage1', [], new Date())

      const data = tx.productionStagePage.updateMany.mock.calls[0][0].data
      expect(data).not.toHaveProperty('outputFileKey')
      expect(data).not.toHaveProperty('outputRevision')
      expect(data).not.toHaveProperty('outputSourceType')
      // Xoá dấu xác nhận là đủ: completeStage đòi outputConfirmedAt nên vẫn buộc confirm lại,
      // và guard idempotency của confirmOutputs (`if (stagePage.outputConfirmedAt)`) được bỏ qua
      // nên Mangaka ghi đè được bằng file mới.
      expect(data).toEqual({ outputConfirmedAt: null, outputConfirmedBy: null })
    })

    it('skips the relock queries entirely when there is no later stage', async () => {
      const { tx, repo } = createFixture()
      const result = await repo.reopenStageAndRelockAfter('final', [], new Date())

      expect(tx.productionStage.updateMany).not.toHaveBeenCalled()
      expect(tx.productionStagePage.deleteMany).not.toHaveBeenCalled()
      expect(result).toEqual({ clearedStagePages: 0 })
    })
  })

  describe('confirmOutputs transaction', () => {
    it('persists a reuse command without mutating the Page composite revision', async () => {
      const { tx, repo } = createFixture()
      tx.productionStagePage.findMany.mockResolvedValue([{ pageId, outputFileKey: 'one.png' }])
      await repo.confirmOutputs(stageId, 'm1', [
        {
          pageId,
          outputSourceType: AiSegmentSource.ORIGINAL,
          outputFileKey: 'one.png',
          outputRevision: 3
        }
      ])
      expect(tx.page.update).not.toHaveBeenCalled()
      expect(tx.productionStagePage.update).toHaveBeenCalledWith({
        where: { stageId_pageId: { stageId, pageId } },
        data: expect.objectContaining({
          outputSourceType: AiSegmentSource.ORIGINAL,
          outputFileKey: 'one.png',
          outputRevision: 3,
          outputConfirmedBy: 'm1'
        })
      })
    })

    it('persists the service-provided composite revision in the same transaction', async () => {
      const { tx, repo } = createFixture()
      tx.productionStagePage.findMany.mockResolvedValue([])
      await repo.confirmOutputs(stageId, 'm1', [
        {
          pageId,
          outputSourceType: AiSegmentSource.COMPOSITE,
          outputFileKey: 'composite.png',
          outputRevision: 5,
          compositeUpdate: { fileKey: 'composite.png', revision: 5 }
        }
      ])
      expect(tx.page.update).toHaveBeenCalledWith({
        where: { id: pageId },
        data: { compositeFile: 'composite.png', compositeRevision: 5 }
      })
      expect(tx.productionStagePage.update).toHaveBeenCalledWith({
        where: { stageId_pageId: { stageId, pageId } },
        data: expect.objectContaining({
          outputSourceType: AiSegmentSource.COMPOSITE,
          outputFileKey: 'composite.png',
          outputRevision: 5
        })
      })
    })
  })
})
