import { ManuscriptStatus, ProductionStageStatus, TaskStatus } from '@prisma/client'
import { ChapterNotFoundException, ChapterOnHoldException } from '../errors/chapter.errors'
import {
  StageAccessDeniedException,
  StageNotDeletableException,
  StageNotEditableException,
  StageNotFoundException,
  StageNotInsertableException,
  StageReopenNotAllowedException
} from '../errors/production-stage.errors'
import { ProductionStageService } from './production-stage.service'
import { ProductionStageAccessService } from './production-stage-access.service'
import { ProductionStageAnalyticsService } from './production-stage-analytics.service'

const chapterId = '0123456789abcdef01234567'
const stageId = 'fedcba987654321001234567'
const user = { userId: 'm1', roleName: 'MANGAKA' }

const stage = (overrides: Record<string, unknown> = {}) => ({
  id: stageId,
  chapterId,
  order: 1,
  name: 'INKING',
  taskTypes: [],
  isFinalCheck: false,
  status: ProductionStageStatus.ACTIVE,
  deadline: null,
  startedAt: null,
  completedAt: null,
  ...overrides
})

const createFixture = (options: { chapter?: unknown; series?: unknown } = {}) => {
  const repo = {
    findByChapter: jest.fn().mockResolvedValue([]),
    findTasksForStageAnalytics: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    updateMeta: jest.fn(),
    findScheduleByChapterId: jest.fn(),
    shiftOrderFrom: jest.fn().mockResolvedValue(undefined),
    create: jest.fn(),
    countTasksByStage: jest.fn().mockResolvedValue(0),
    deleteById: jest.fn().mockResolvedValue(undefined)
  }
  const chapterRepo = {
    findChapterById: jest
      .fn()
      .mockResolvedValue(
        options.chapter === undefined ? { id: chapterId, seriesId: 's1', hold: null } : options.chapter
      ),
    findSeriesById: jest
      .fn()
      .mockResolvedValue(options.series === undefined ? { id: 's1', mangakaId: 'm1', editorId: 'e1' } : options.series),
    findScheduleByChapterId: jest.fn(),
    findManuscriptByChapterId: jest.fn().mockResolvedValue({ status: ManuscriptStatus.EDITOR_REVISION })
  }
  const stateService = {
    completeStage: jest.fn().mockResolvedValue(undefined),
    reopenStage: jest.fn().mockResolvedValue({ stageId, relockedStageIds: ['later1'], clearedStagePages: 2 })
  }
  const accessService = new ProductionStageAccessService(chapterRepo as never)
  const analyticsService = new ProductionStageAnalyticsService(repo as never, accessService)
  return {
    repo,
    chapterRepo,
    stateService,
    service: new ProductionStageService(
      repo as never,
      chapterRepo as never,
      stateService as never,
      accessService,
      analyticsService
    )
  }
}

describe('ProductionStageService', () => {
  describe('scope checks', () => {
    it('rejects malformed, missing chapter and missing series before persistence operations', async () => {
      const malformed = createFixture()
      await expect(malformed.service.list(user, 'bad-id')).rejects.toBe(ChapterNotFoundException)
      expect(malformed.chapterRepo.findChapterById).not.toHaveBeenCalled()

      const missingChapter = createFixture({ chapter: null })
      await expect(missingChapter.service.list(user, chapterId)).rejects.toBe(ChapterNotFoundException)
      expect(missingChapter.chapterRepo.findSeriesById).not.toHaveBeenCalled()

      const missingSeries = createFixture({ series: null })
      await expect(missingSeries.service.list(user, chapterId)).rejects.toBe(ChapterNotFoundException)
    })

    it.each([
      [{ userId: 'other', roleName: 'MANGAKA' }],
      [{ userId: 'other', roleName: 'EDITOR' }],
      [{ userId: 'm1', roleName: 'ASSISTANT' }]
    ])('denies out-of-scope actor %p', async (actor) => {
      const fixture = createFixture()
      await expect(fixture.service.list(actor, chapterId)).rejects.toBe(StageAccessDeniedException)
      expect(fixture.repo.findByChapter).not.toHaveBeenCalled()
    })

    it.each([
      [{ userId: 'm1', roleName: 'MANGAKA' }],
      [{ userId: 'e1', roleName: 'EDITOR' }],
      [{ userId: 'board', roleName: 'BOARD_MEMBER' }],
      [{ userId: 'admin', roleName: 'SUPER_ADMIN' }]
    ])('allows scoped actor %p to read', async (actor) => {
      const fixture = createFixture()
      await expect(fixture.service.list(actor, chapterId)).resolves.toMatchObject({ stages: [] })
    })
  })

  it('computes stage analytics, late-task fallback and bottleneck without counting unscoped tasks', async () => {
    const fixture = createFixture()
    const now = Date.now()
    fixture.repo.findByChapter.mockResolvedValue([
      stage({
        id: 'active',
        deadline: new Date(now - 10_000),
        startedAt: new Date(now - 20_000)
      }),
      stage({
        id: 'done',
        order: 2,
        status: ProductionStageStatus.COMPLETED,
        startedAt: new Date(now - 50_000),
        completedAt: new Date(now - 10_000)
      }),
      stage({ id: 'empty', order: 3, status: ProductionStageStatus.LOCKED })
    ])
    fixture.repo.findTasksForStageAnalytics.mockResolvedValue([
      {
        id: 'ignored',
        stageId: null,
        taskType: null,
        assistantId: null,
        status: TaskStatus.ASSIGNED,
        deadline: null,
        startedAt: null,
        completedAt: null
      },
      {
        id: 'open',
        stageId: 'active',
        taskType: 'INKING',
        assistantId: 'a1',
        status: TaskStatus.IN_PROGRESS,
        deadline: null,
        startedAt: new Date(now - 10_000),
        completedAt: null
      },
      {
        id: 'approved-late-own-deadline',
        stageId: 'active',
        taskType: null,
        assistantId: null,
        status: TaskStatus.APPROVED,
        deadline: new Date(now - 8_000),
        startedAt: new Date(now - 7_000),
        completedAt: new Date(now - 5_000)
      },
      {
        id: 'approved-late-stage-deadline',
        stageId: 'active',
        taskType: null,
        assistantId: null,
        status: TaskStatus.APPROVED,
        deadline: null,
        startedAt: null,
        completedAt: new Date(now - 1_000)
      },
      {
        id: 'done-task',
        stageId: 'done',
        taskType: null,
        assistantId: null,
        status: TaskStatus.APPROVED,
        deadline: new Date(now),
        startedAt: new Date(now - 4_000),
        completedAt: new Date(now - 2_000)
      }
    ])

    const result = await fixture.service.list(user, chapterId)

    expect(result.currentStage).toEqual({ id: 'active', name: 'INKING', order: 1 })
    expect(result.bottleneckStage).toEqual({ stageId: 'done', name: 'INKING', stageDurationMs: 40_000 })
    expect(result.stages[0].analytics).toMatchObject({
      taskCount: 3,
      approvedCount: 2,
      openCount: 1,
      lateTaskCount: 2,
      longestTask: { taskId: 'open', taskType: 'INKING', assistantId: 'a1' }
    })
    expect(result.stages[2].analytics).toMatchObject({
      taskCount: 0,
      avgTaskDurationMs: 0,
      longestTask: null,
      stageDurationMs: null
    })
  })

  it('returns no active/bottleneck stage when no stage has timing data', async () => {
    const fixture = createFixture()
    fixture.repo.findByChapter.mockResolvedValue([stage({ status: ProductionStageStatus.LOCKED })])
    await expect(fixture.service.list(user, chapterId)).resolves.toMatchObject({
      currentStage: null,
      bottleneckStage: null
    })
  })

  describe('complete', () => {
    it('blocks a held chapter without invoking the state writer', async () => {
      const fixture = createFixture({ chapter: { id: chapterId, seriesId: 's1', hold: { reason: 'pause' } } })
      await expect(fixture.service.complete(user, chapterId, stageId)).rejects.toBe(ChapterOnHoldException)
      expect(fixture.stateService.completeStage).not.toHaveBeenCalled()
    })

    it('delegates completion to the sole state writer', async () => {
      const fixture = createFixture()
      await expect(fixture.service.complete(user, chapterId, stageId)).resolves.toHaveProperty('message')
      expect(fixture.stateService.completeStage).toHaveBeenCalledWith(chapterId, stageId, 'm1')
    })
  })

  describe('reopen', () => {
    it('returns a payload that carries the custom message field', async () => {
      const fixture = createFixture()
      await expect(fixture.service.reopen(user, chapterId, stageId)).resolves.toEqual({
        message: 'Đã mở lại giai đoạn sản xuất',
        stageId,
        relockedStageIds: ['later1'],
        clearedStagePages: 2
      })
    })

    it('rejects a malformed stage id with 404 instead of reaching the state service', async () => {
      const fixture = createFixture()
      await expect(fixture.service.reopen(user, chapterId, 'not-an-id')).rejects.toBe(StageNotFoundException)
      expect(fixture.stateService.reopenStage).not.toHaveBeenCalled()
    })

    it('rejects when the chapter is on hold', async () => {
      const fixture = createFixture({ chapter: { id: chapterId, seriesId: 's1', hold: { reason: 'pause' } } })
      await expect(fixture.service.reopen(user, chapterId, stageId)).rejects.toBe(ChapterOnHoldException)
    })

    it('rejects a user who is not the owning mangaka', async () => {
      const fixture = createFixture({ series: { id: 's1', mangakaId: 'someone-else', editorId: 'e1' } })
      await expect(fixture.service.reopen(user, chapterId, stageId)).rejects.toBe(StageAccessDeniedException)
    })

    it.each([
      ManuscriptStatus.EDITOR_REVIEW,
      ManuscriptStatus.READY_FOR_PRINT,
      ManuscriptStatus.PUBLISHED,
      ManuscriptStatus.IN_PRODUCTION
    ])('rejects when the manuscript is %s', async (status) => {
      const fixture = createFixture()
      fixture.chapterRepo.findManuscriptByChapterId.mockResolvedValue({ status })
      await expect(fixture.service.reopen(user, chapterId, stageId)).rejects.toBe(StageReopenNotAllowedException)
    })

    it('checks ownership before manuscript state', async () => {
      const fixture = createFixture({ series: { id: 's1', mangakaId: 'someone-else', editorId: 'e1' } })
      fixture.chapterRepo.findManuscriptByChapterId.mockResolvedValue({ status: ManuscriptStatus.PUBLISHED })
      await expect(fixture.service.reopen(user, chapterId, stageId)).rejects.toBe(StageAccessDeniedException)
      expect(fixture.chapterRepo.findManuscriptByChapterId).not.toHaveBeenCalled()
    })
  })

  describe('patch', () => {
    it.each([[null], [stage({ chapterId: 'other' })]])('hides missing or cross-chapter stage', async (value) => {
      const fixture = createFixture()
      fixture.repo.findById.mockResolvedValue(value)
      await expect(fixture.service.patch(user, chapterId, stageId, { name: 'Next' })).rejects.toBe(
        StageNotFoundException
      )
    })

    it('does not edit a completed stage', async () => {
      const fixture = createFixture()
      fixture.repo.findById.mockResolvedValue(stage({ status: ProductionStageStatus.COMPLETED }))
      await expect(fixture.service.patch(user, chapterId, stageId, { name: 'Next' })).rejects.toBe(
        StageNotEditableException
      )
    })

    it('maps partial metadata and warns when stage deadline exceeds chapter schedule', async () => {
      const fixture = createFixture()
      fixture.repo.findById.mockResolvedValue(stage())
      fixture.repo.updateMeta.mockResolvedValue(stage({ name: 'Next', deadline: new Date('2026-08-02T00:00:00.000Z') }))
      fixture.chapterRepo.findScheduleByChapterId.mockResolvedValue({
        currentDeadline: new Date('2026-08-01T00:00:00.000Z')
      })

      const result = await fixture.service.patch(user, chapterId, stageId, {
        name: 'Next',
        deadline: '2026-08-02T00:00:00.000Z'
      })

      expect(fixture.repo.updateMeta).toHaveBeenCalledWith(stageId, {
        name: 'Next',
        deadline: new Date('2026-08-02T00:00:00.000Z')
      })
      expect(result.warnings).toEqual(['STAGE_DEADLINE_EXCEEDS_CHAPTER'])
    })

    it.each([
      [{ deadline: null }, null],
      [{}, undefined]
    ])('supports deadline clearing/omission without warning', async (body, expectedDeadline) => {
      const fixture = createFixture()
      fixture.repo.findById.mockResolvedValue(stage())
      fixture.repo.updateMeta.mockResolvedValue(stage())
      fixture.chapterRepo.findScheduleByChapterId.mockResolvedValue(null)
      const result = await fixture.service.patch(user, chapterId, stageId, body)
      expect(fixture.repo.updateMeta).toHaveBeenCalledWith(
        stageId,
        expectedDeadline === undefined ? {} : { deadline: expectedDeadline }
      )
      expect(result.warnings).toEqual([])
    })
  })

  describe('add', () => {
    it.each([
      [null, [stage(), stage({ isFinalCheck: true, order: 4 })], StageNotFoundException],
      [stage({ chapterId: 'other' }), [stage({ isFinalCheck: true, order: 4 })], StageNotFoundException],
      [stage({ isFinalCheck: true }), [stage({ isFinalCheck: true, order: 4 })], StageNotInsertableException],
      [stage(), [stage()], StageNotInsertableException],
      [stage({ order: 4 }), [stage({ isFinalCheck: true, order: 4 })], StageNotInsertableException],
      [
        stage({ status: ProductionStageStatus.COMPLETED }),
        [stage({ isFinalCheck: true, order: 4 })],
        StageNotInsertableException
      ],
      [
        stage({ order: 1 }),
        [stage({ id: 'active', order: 2 }), stage({ isFinalCheck: true, order: 4 })],
        StageNotInsertableException
      ]
    ])('rejects insertion at an invalid workflow boundary', async (after, stages, error) => {
      const fixture = createFixture()
      fixture.repo.findById.mockResolvedValue(after)
      fixture.repo.findByChapter.mockResolvedValue(stages)
      await expect(
        fixture.service.add(user, chapterId, { afterStageId: stageId, name: 'NEW', taskTypes: [] })
      ).rejects.toBe(error)
      expect(fixture.repo.create).not.toHaveBeenCalled()
    })

    it('shifts following stages and creates a locked custom stage', async () => {
      const fixture = createFixture()
      fixture.repo.findById.mockResolvedValue(stage({ status: ProductionStageStatus.LOCKED }))
      fixture.repo.findByChapter.mockResolvedValue([
        stage({ status: ProductionStageStatus.LOCKED }),
        stage({ id: 'final', order: 4, isFinalCheck: true, status: ProductionStageStatus.LOCKED })
      ])
      fixture.repo.create.mockResolvedValue(
        stage({ id: 'new', order: 2, name: 'NEW', status: ProductionStageStatus.LOCKED })
      )

      const result = await fixture.service.add(user, chapterId, {
        afterStageId: stageId,
        name: 'NEW',
        taskTypes: []
      })

      expect(fixture.repo.shiftOrderFrom).toHaveBeenCalledWith(chapterId, 2, 1)
      expect(fixture.repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ chapterId, order: 2, isFinalCheck: false, status: ProductionStageStatus.LOCKED })
      )
      expect(result).toMatchObject({ id: 'new', order: 2 })
    })

    it('uses the insert-specific error for add and keeps the delete-specific error for remove', async () => {
      const completed = stage({ status: ProductionStageStatus.COMPLETED, order: 1 })
      const finalCheck = stage({ id: 'final1', isFinalCheck: true, order: 4, status: ProductionStageStatus.COMPLETED })

      const fAdd = createFixture()
      fAdd.repo.findById.mockResolvedValue(completed)
      fAdd.repo.findByChapter.mockResolvedValue([completed, finalCheck])
      await expect(
        fAdd.service.add(user, chapterId, { name: 'REWORK', taskTypes: [], afterStageId: stageId })
      ).rejects.toBe(StageNotInsertableException)

      const fRemove = createFixture()
      fRemove.repo.findById.mockResolvedValue(stage({ status: ProductionStageStatus.ACTIVE }))
      fRemove.repo.countTasksByStage.mockResolvedValue(0)
      await expect(fRemove.service.remove(user, chapterId, stageId)).rejects.toBe(StageNotDeletableException)
    })
  })

  describe('remove', () => {
    it.each([
      [null, 0, StageNotFoundException],
      [stage({ chapterId: 'other' }), 0, StageNotFoundException],
      [stage({ status: ProductionStageStatus.ACTIVE }), 0, StageNotDeletableException],
      [stage({ status: ProductionStageStatus.LOCKED, isFinalCheck: true }), 0, StageNotDeletableException],
      [stage({ status: ProductionStageStatus.LOCKED }), 1, StageNotDeletableException]
    ])('rejects deletion that violates stage invariants', async (value, taskCount, error) => {
      const fixture = createFixture()
      fixture.repo.findById.mockResolvedValue(value)
      fixture.repo.countTasksByStage.mockResolvedValue(taskCount)
      await expect(fixture.service.remove(user, chapterId, stageId)).rejects.toBe(error)
      expect(fixture.repo.deleteById).not.toHaveBeenCalled()
    })

    it('deletes an unused locked stage and closes the order gap', async () => {
      const fixture = createFixture()
      fixture.repo.findById.mockResolvedValue(stage({ order: 2, status: ProductionStageStatus.LOCKED }))
      await expect(fixture.service.remove(user, chapterId, stageId)).resolves.toHaveProperty('message')
      expect(fixture.repo.deleteById).toHaveBeenCalledWith(stageId)
      expect(fixture.repo.shiftOrderFrom).toHaveBeenCalledWith(chapterId, 3, -1)
    })
  })
})
