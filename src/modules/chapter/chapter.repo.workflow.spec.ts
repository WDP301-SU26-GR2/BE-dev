import { ChapterStatus, ManuscriptStatus, PageStatus, TaskStatus } from '@prisma/client'
import { ChapterRepository } from './chapter.repo'

const chapterId = '0123456789abcdef01234567'

const createFixture = () => {
  const tx = {
    storyboard: { deleteMany: jest.fn() },
    manuscript: { deleteMany: jest.fn(), update: jest.fn() },
    schedule: { deleteMany: jest.fn() },
    page: { deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    productionStagePage: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    aiJob: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    annotation: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    task: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    region: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    chapterCoOwnerApproval: { deleteMany: jest.fn() },
    deadlineRequest: { deleteMany: jest.fn() },
    chapter: { delete: jest.fn(), update: jest.fn() }
  }
  const prisma = {
    series: { findUnique: jest.fn(), findMany: jest.fn() },
    storyboard: { findUnique: jest.fn(), update: jest.fn() },
    contract: { findFirst: jest.fn() },
    chapter: {
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn()
    },
    manuscript: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    schedule: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    page: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn()
    },
    task: { groupBy: jest.fn(), findMany: jest.fn() },
    chapterCoOwnerApproval: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    role: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
    $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx))
  }
  return { tx, prisma, repo: new ChapterRepository(prisma as never) }
}

describe('ChapterRepository workflow persistence', () => {
  it('creates the chapter aggregate with manuscript and schedule before returning relations', async () => {
    const { prisma, repo } = createFixture()
    prisma.chapter.create.mockResolvedValue({ id: chapterId })
    prisma.chapter.findUnique.mockResolvedValue({ id: chapterId, manuscript: {}, schedule: {} })

    await expect(
      repo.createChapter({ seriesId: 'series', chapterNumber: 2, title: undefined, storyboardId: undefined })
    ).resolves.toMatchObject({ id: chapterId })

    expect(prisma.chapter.create).toHaveBeenCalledWith({
      data: {
        seriesId: 'series',
        storyboardId: null,
        chapterNumber: 2,
        title: null,
        status: ChapterStatus.DRAFT
      }
    })
    expect(prisma.manuscript.create).toHaveBeenCalledWith({
      data: { chapterId, status: ManuscriptStatus.DRAFT }
    })
    expect(prisma.schedule.create).toHaveBeenCalledWith({ data: { chapterId } })
  })

  it('filters published and held chapters from deadline warnings', async () => {
    const { prisma, repo } = createFixture()
    prisma.schedule.findMany.mockResolvedValue([
      {
        chapterId: 'eligible',
        chapter: {
          seriesId: 's1',
          status: ChapterStatus.DRAFT,
          hold: null,
          chapterNumber: 2,
          series: { title: 'Bộ truyện thử' }
        }
      },
      { chapterId: 'published', chapter: { seriesId: 's2', status: ChapterStatus.PUBLISHED, hold: null } },
      { chapterId: 'held', chapter: { seriesId: 's3', status: ChapterStatus.DRAFT, hold: { reason: 'pause' } } }
    ])
    await expect(repo.findChaptersNearDeadline(new Date())).resolves.toEqual([
      { chapterId: 'eligible', seriesId: 's1', chapterNumber: 2, seriesTitle: 'Bộ truyện thử' }
    ])
  })

  it.each([
    [[], {}],
    [
      [
        { status: PageStatus.DRAFT, _count: { _all: 2 } },
        { status: PageStatus.COMPLETED, _count: { _all: 1 } }
      ],
      { DRAFT: 2, COMPLETED: 1 }
    ]
  ])('maps grouped page counts by state', async (rows, expected) => {
    const { prisma, repo } = createFixture()
    prisma.page.groupBy.mockResolvedValue(rows)
    await expect(repo.countPagesByStatus(chapterId)).resolves.toEqual(expected)
  })

  it('skips task aggregation for a chapter without pages', async () => {
    const { prisma, repo } = createFixture()
    prisma.page.findMany.mockResolvedValue([])
    await expect(repo.countTasksByStatusForChapter(chapterId)).resolves.toEqual({})
    expect(prisma.task.groupBy).not.toHaveBeenCalled()
  })

  it('maps task aggregation for chapter pages', async () => {
    const { prisma, repo } = createFixture()
    prisma.page.findMany.mockResolvedValue([{ id: 'p1' }])
    prisma.task.groupBy.mockResolvedValue([{ status: TaskStatus.APPROVED, _count: { _all: 3 } }])
    await expect(repo.countTasksByStatusForChapter(chapterId)).resolves.toEqual({ APPROVED: 3 })
  })

  it.each([
    ['findActiveChaptersForMangaka', 'mangakaId'],
    ['findActiveChaptersForEditor', 'editorId']
  ] as const)('does not query chapters when %s has no scoped series', async (method, field) => {
    const { prisma, repo } = createFixture()
    prisma.series.findMany.mockResolvedValue([])
    await expect(repo[method]('user')).resolves.toEqual({ series: [], chapters: [] })
    expect(prisma.series.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { [field]: 'user' } }))
    expect(prisma.chapter.findMany).not.toHaveBeenCalled()
  })

  it('queries only unpublished chapters for scoped Mangaka series', async () => {
    const { prisma, repo } = createFixture()
    prisma.series.findMany.mockResolvedValue([{ id: 's1', title: 'One' }])
    prisma.chapter.findMany.mockResolvedValue([{ id: chapterId }])
    await expect(repo.findActiveChaptersForMangaka('m1')).resolves.toMatchObject({
      chapters: [{ id: chapterId }]
    })
    expect(prisma.chapter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { seriesId: { in: ['s1'] }, status: { not: ChapterStatus.PUBLISHED } },
        take: 200
      })
    )
  })

  it('avoids group queries for empty chapter/page sets', async () => {
    const { prisma, repo } = createFixture()
    await expect(repo.groupTasksByPageForChapters([])).resolves.toEqual([])
    prisma.page.findMany.mockResolvedValue([])
    await expect(repo.groupTasksByPageForChapters([chapterId])).resolves.toEqual([])
    expect(prisma.task.groupBy).not.toHaveBeenCalled()
  })

  it('maps per-page task rows back to their owning chapters', async () => {
    const { prisma, repo } = createFixture()
    prisma.page.findMany.mockResolvedValue([{ id: 'p1', chapterId }])
    prisma.task.groupBy.mockResolvedValue([{ pageId: 'p1', status: TaskStatus.IN_PROGRESS, _count: { _all: 2 } }])
    await expect(repo.groupTasksByPageForChapter(chapterId)).resolves.toEqual([
      { pageId: 'p1', status: TaskStatus.IN_PROGRESS, count: 2 }
    ])
  })

  it('filters missing and held task pages from deadline notifications', async () => {
    const { prisma, repo } = createFixture()
    prisma.task.findMany.mockResolvedValue([
      { id: 't1', assistantId: 'a1', pageId: 'p1' },
      { id: 't2', assistantId: 'a2', pageId: 'missing' },
      { id: 't3', assistantId: 'a3', pageId: 'held' }
    ])
    prisma.page.findMany.mockResolvedValue([
      { id: 'p1', chapter: { hold: null, series: { mangakaId: 'm1' } } },
      { id: 'held', chapter: { hold: { reason: 'pause' }, series: { mangakaId: 'm2' } } }
    ])
    await expect(repo.findTasksNearDeadline(new Date(), new Date())).resolves.toEqual([
      {
        taskId: 't1',
        assistantId: 'a1',
        mangakaId: 'm1',
        taskType: undefined,
        pageNumber: undefined,
        chapterNumber: undefined,
        isOverdue: false
      }
    ])
  })

  it('does not look up pages when there are no near-deadline tasks', async () => {
    const { prisma, repo } = createFixture()
    prisma.task.findMany.mockResolvedValue([])
    await expect(repo.findTasksNearDeadline(new Date(), new Date())).resolves.toEqual([])
    expect(prisma.page.findMany).not.toHaveBeenCalled()
  })

  it.each([
    [ManuscriptStatus.PUBLISHED, true],
    [ManuscriptStatus.EDITOR_REVISION, false]
  ])('atomically derives chapter state metadata for manuscript transition to %s', async (to, published) => {
    const { prisma, repo } = createFixture()
    prisma.chapter.findUnique.mockResolvedValue({ id: chapterId })
    await repo.applyManuscriptTransition(chapterId, 'manuscript', {
      from: ManuscriptStatus.EDITOR_REVIEW,
      to,
      changedBy: 'editor',
      reason: undefined
    })
    expect(prisma.manuscript.update).toHaveBeenCalledWith({
      where: { id: 'manuscript' },
      data: expect.objectContaining({
        status: to,
        approvedAt: published ? expect.any(Date) : undefined,
        statusHistory: {
          push: expect.objectContaining({ reason: null, changedBy: 'editor' })
        }
      })
    })
    expect(prisma.chapter.update).toHaveBeenCalledWith({
      where: { id: chapterId },
      data: expect.objectContaining({ publishedAt: published ? expect.any(Date) : undefined })
    })
  })

  it('deletes the complete chapter aggregate in one transaction', async () => {
    const { tx, repo } = createFixture()
    await repo.deleteChapterCascade(chapterId)
    expect(tx.storyboard.deleteMany).toHaveBeenCalledWith({ where: { chapterId } })
    expect(tx.chapterCoOwnerApproval.deleteMany).toHaveBeenCalledWith({ where: { chapterId } })
    expect(tx.deadlineRequest.deleteMany).toHaveBeenCalledWith({ where: { chapterId } })
    expect(tx.chapter.delete).toHaveBeenCalledWith({ where: { id: chapterId } })
  })

  it('deletes page dependants and closes numbering gaps in the same transaction', async () => {
    const { tx, repo } = createFixture()
    tx.task.deleteMany.mockResolvedValue({ count: 2 })
    tx.region.deleteMany.mockResolvedValue({ count: 3 })
    tx.page.findMany.mockResolvedValue([
      { id: 'p1', pageNumber: 1 },
      { id: 'p3', pageNumber: 3 }
    ])
    await expect(repo.deletePagesCascade(chapterId, ['deleted'])).resolves.toEqual({
      deletedTasks: 2,
      deletedRegions: 3,
      deletedAnnotations: 0,
      removedTasks: []
    })
    expect(tx.task.findMany).toHaveBeenCalledWith({
      where: { pageId: { in: ['deleted'] } },
      select: { id: true, assistantId: true, status: true, taskType: true, versions: true }
    })
    expect(tx.annotation.deleteMany).toHaveBeenCalledWith({ where: { taskId: { in: [] } } })
    expect(tx.productionStagePage.deleteMany).toHaveBeenCalledWith({ where: { pageId: { in: ['deleted'] } } })
    expect(tx.aiJob.deleteMany).toHaveBeenCalledWith({ where: { pageId: { in: ['deleted'] } } })
    expect(tx.page.update).toHaveBeenCalledWith({ where: { id: 'p3' }, data: { pageNumber: 2 } })
  })

  it('deletes task-linked annotations and reports the removed tasks', async () => {
    const { tx, repo } = createFixture()
    tx.task.findMany.mockResolvedValue([
      { id: 't1', assistantId: 'a1', status: 'IN_PROGRESS', taskType: 'INKING', versions: [{}, {}] },
      { id: 't2', assistantId: null, status: 'ASSIGNED', taskType: null, versions: [] }
    ])
    tx.annotation.deleteMany.mockResolvedValue({ count: 5 })
    tx.task.deleteMany.mockResolvedValue({ count: 2 })
    tx.region.deleteMany.mockResolvedValue({ count: 3 })

    await expect(repo.deletePagesCascade(chapterId, ['p1'])).resolves.toEqual({
      deletedTasks: 2,
      deletedRegions: 3,
      deletedAnnotations: 5,
      removedTasks: [
        { id: 't1', assistantId: 'a1', status: 'IN_PROGRESS', taskType: 'INKING', versionCount: 2 },
        { id: 't2', assistantId: null, status: 'ASSIGNED', taskType: null, versionCount: 0 }
      ]
    })
    expect(tx.annotation.deleteMany).toHaveBeenCalledWith({ where: { taskId: { in: ['t1', 't2'] } } })
  })

  it('reads the task list inside the transaction before deleting tasks', async () => {
    const { tx, repo } = createFixture()
    const order: string[] = []
    tx.task.findMany.mockImplementation(() => {
      order.push('read')
      return Promise.resolve([])
    })
    tx.task.deleteMany.mockImplementation(() => {
      order.push('delete')
      return Promise.resolve({ count: 0 })
    })

    await repo.deletePagesCascade(chapterId, ['p1'])

    expect(order).toEqual(['read', 'delete'])
  })

  it.each([
    [[], null],
    [[{ id: 'latest' }], { id: 'latest' }]
  ])('returns the latest co-owner approval or null', async (rows, expected) => {
    const { prisma, repo } = createFixture()
    prisma.chapterCoOwnerApproval.findMany.mockResolvedValue(rows)
    await expect(repo.findCoOwnerApprovalByChapterId(chapterId)).resolves.toEqual(expected)
  })

  it('returns no Board members when the role is absent', async () => {
    const { prisma, repo } = createFixture()
    prisma.role.findFirst.mockResolvedValue(null)
    await expect(repo.findBoardMemberIds()).resolves.toEqual([])
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })

  it('returns active Board member ids using absent-field soft-delete semantics', async () => {
    const { prisma, repo } = createFixture()
    prisma.role.findFirst.mockResolvedValue({ id: 'role' })
    prisma.user.findMany.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }])
    await expect(repo.findBoardMemberIds()).resolves.toEqual(['b1', 'b2'])
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { roleId: 'role', deletedAt: { isSet: false } },
      select: { id: true }
    })
  })
})
