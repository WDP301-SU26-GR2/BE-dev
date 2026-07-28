import { ManuscriptStatus, PageStatus, ProductionStageStatus } from '@prisma/client'
import {
  NoPagesToSubmitException,
  NotSeriesOwnerException,
  RevisionNotResolvedException,
  TasksNotAllApprovedException
} from '../errors/chapter.errors'
import { ProductionNotFinalizedException } from '../errors/production-stage.errors'
import { ManuscriptReviewService } from './manuscript-review.service'

function makeDeps() {
  const repo = {
    findChapterById: jest.fn().mockResolvedValue({ id: 'c1', seriesId: 's1', hold: null }),
    findSeriesById: jest.fn().mockResolvedValue({ id: 's1', mangakaId: 'm1', editorId: 'e1' }),
    findPagesByChapterId: jest.fn().mockResolvedValue([{ id: 'p1', status: PageStatus.DRAFT }]),
    countTasksByStatusForChapter: jest.fn().mockResolvedValue({ APPROVED: 1 })
  }
  const manuscriptState = {
    assertCanTransition: jest.fn().mockResolvedValue(undefined),
    transitionWithPages: jest.fn().mockResolvedValue({ status: ManuscriptStatus.EDITOR_REVIEW }),
    transition: jest.fn().mockResolvedValue({ status: ManuscriptStatus.READY_FOR_PRINT })
  }
  const notification = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const revision = {
    openSafe: jest.fn().mockResolvedValue({ round: 1 }),
    currentRound: jest.fn().mockResolvedValue(1),
    hasOpenRequest: jest.fn().mockResolvedValue(false)
  }
  const service = new ManuscriptReviewService(
    repo as never,
    manuscriptState as never,
    notification as never,
    revision as never
  )
  return { repo, manuscriptState, notification, revision, service }
}

type StageFixtureRow = {
  id: string
  order: number
  name: string
  isFinalCheck: boolean
  status: ProductionStageStatus
}

const STAGES_ALL_DONE: StageFixtureRow[] = [
  { id: 's1', order: 1, name: 'INKING', isFinalCheck: false, status: ProductionStageStatus.COMPLETED },
  { id: 's2', order: 2, name: 'DETAILING', isFinalCheck: false, status: ProductionStageStatus.COMPLETED },
  { id: 's3', order: 3, name: 'LETTERING', isFinalCheck: false, status: ProductionStageStatus.COMPLETED },
  { id: 's4', order: 4, name: 'FINAL_CHECK', isFinalCheck: true, status: ProductionStageStatus.COMPLETED }
]

function makeStageDeps(stages = STAGES_ALL_DONE) {
  const base = makeDeps()
  const stageRepo = {
    countByChapter: jest.fn().mockResolvedValue(stages.length),
    findByChapter: jest.fn().mockResolvedValue(stages),
    findFinalCheck: jest.fn().mockResolvedValue(stages.find((stage) => stage.isFinalCheck))
  }
  const stageStateService = { markFinalCheckCompleted: jest.fn().mockResolvedValue(undefined) }
  const service = new ManuscriptReviewService(
    base.repo as never,
    base.manuscriptState as never,
    base.notification as never,
    base.revision as never,
    stageRepo as never,
    stageStateService as never
  )
  return { ...base, stageRepo, stageStateService, service }
}

const withActive = (id: string) =>
  STAGES_ALL_DONE.map((stage) => (stage.id === id ? { ...stage, status: ProductionStageStatus.ACTIVE } : stage))

describe('ManuscriptReviewService (Spec 18)', () => {
  it('checks authorization before state and business gates', async () => {
    const d = makeDeps()
    d.repo.findSeriesById.mockResolvedValue({ id: 's1', mangakaId: 'other', editorId: 'e1' })
    await expect(d.service.submit('m1', 'c1')).rejects.toBe(NotSeriesOwnerException)
    expect(d.manuscriptState.assertCanTransition).not.toHaveBeenCalled()
    expect(d.repo.findPagesByChapterId).not.toHaveBeenCalled()
  })

  it('checks manuscript state before page/task business gates', async () => {
    const d = makeDeps()
    await d.service.submit('m1', 'c1')
    expect(d.manuscriptState.assertCanTransition.mock.invocationCallOrder[0]).toBeLessThan(
      d.repo.findPagesByChapterId.mock.invocationCallOrder[0]
    )
  })

  it('throws NoPagesToSubmit for an empty chapter', async () => {
    const d = makeDeps()
    d.repo.findPagesByChapterId.mockResolvedValue([])
    await expect(d.service.submit('m1', 'c1')).rejects.toBe(NoPagesToSubmitException)
  })

  it('throws TasksNotAllApproved for a blocking task including ON_HOLD', async () => {
    const d = makeDeps()
    d.repo.countTasksByStatusForChapter.mockResolvedValue({ APPROVED: 2, ON_HOLD: 1 })
    await expect(d.service.submit('m1', 'c1')).rejects.toBe(TasksNotAllApprovedException)
  })

  it('submits with APPROVED/CANCELLED tasks and atomically flips DRAFT pages', async () => {
    const d = makeDeps()
    d.repo.countTasksByStatusForChapter.mockResolvedValue({ APPROVED: 2, CANCELLED: 1 })
    await d.service.submit('m1', 'c1')
    expect(d.manuscriptState.transitionWithPages).toHaveBeenCalledWith(
      'c1',
      ManuscriptStatus.EDITOR_REVIEW,
      { changedBy: 'm1' },
      [PageStatus.DRAFT],
      PageStatus.COMPLETED
    )
    expect(d.notification.notifySafe.mock.invocationCallOrder[0]).toBeGreaterThan(
      d.manuscriptState.transitionWithPages.mock.invocationCallOrder[0]
    )
  })

  it('allows submit when pages have no tasks', async () => {
    const d = makeDeps()
    d.repo.countTasksByStatusForChapter.mockResolvedValue({})
    await expect(d.service.submit('m1', 'c1')).resolves.toBeDefined()
  })

  it('request-revision atomically flips COMPLETED pages before opening the revision side-effect', async () => {
    const d = makeDeps()
    await d.service.requestRevision('e1', 'c1', 'fix dialog')
    expect(d.manuscriptState.transitionWithPages).toHaveBeenCalledWith(
      'c1',
      ManuscriptStatus.EDITOR_REVISION,
      { changedBy: 'e1', reason: 'fix dialog' },
      [PageStatus.COMPLETED],
      PageStatus.REVISING
    )
    expect(d.revision.openSafe.mock.invocationCallOrder[0]).toBeGreaterThan(
      d.manuscriptState.transitionWithPages.mock.invocationCallOrder[0]
    )
  })

  it('blocks resubmit while a revision request remains open', async () => {
    const d = makeDeps()
    d.revision.hasOpenRequest.mockResolvedValue(true)
    await expect(d.service.resubmit('m1', 'c1')).rejects.toBe(RevisionNotResolvedException)
  })

  it('resubmit flips both REVISING and newly-created DRAFT pages', async () => {
    const d = makeDeps()
    await d.service.resubmit('m1', 'c1')
    expect(d.manuscriptState.transitionWithPages).toHaveBeenCalledWith(
      'c1',
      ManuscriptStatus.EDITOR_REVIEW,
      { changedBy: 'm1' },
      [PageStatus.REVISING, PageStatus.DRAFT],
      PageStatus.COMPLETED
    )
  })

  it('resubmit passes with no revision request (co-owner reject path)', async () => {
    const d = makeDeps()
    d.repo.countTasksByStatusForChapter.mockResolvedValue({})
    await expect(d.service.resubmit('m1', 'c1')).resolves.toBeDefined()
  })

  describe('resubmit stage gating (Spec 26)', () => {
    it('rejects when a production non-final stage is still ACTIVE', async () => {
      const d = makeStageDeps(withActive('s3'))
      await expect(d.service.resubmit('m1', 'c1')).rejects.toBe(ProductionNotFinalizedException)
    })

    it('allows resubmit when only FINAL_CHECK is ACTIVE', async () => {
      const d = makeStageDeps(withActive('s4'))
      await expect(d.service.resubmit('m1', 'c1')).resolves.toBeDefined()
    })

    it('allows resubmit when every stage is COMPLETED', async () => {
      const d = makeStageDeps()
      await expect(d.service.resubmit('m1', 'c1')).resolves.toBeDefined()
    })

    it('closes FINAL_CHECK on resubmit', async () => {
      const d = makeStageDeps(withActive('s4'))
      await d.service.resubmit('m1', 'c1')
      expect(d.stageStateService.markFinalCheckCompleted).toHaveBeenCalledWith('c1')
    })

    it('never inspects findByChapter on the submit path', async () => {
      const d = makeStageDeps(withActive('s4'))
      await d.service.submit('m1', 'c1')
      expect(d.stageRepo.findByChapter).not.toHaveBeenCalled()
      expect(d.stageRepo.findFinalCheck).toHaveBeenCalledWith('c1')
    })

    it('keeps submit requiring an ACTIVE FINAL_CHECK', async () => {
      const d = makeStageDeps()
      await expect(d.service.submit('m1', 'c1')).rejects.toBe(ProductionNotFinalizedException)
    })

    it('leaves the legacy no-stage path unchanged on resubmit', async () => {
      const d = makeDeps()
      d.repo.countTasksByStatusForChapter.mockResolvedValue({ ASSIGNED: 1 })
      await expect(d.service.resubmit('m1', 'c1')).rejects.toBe(TasksNotAllApprovedException)
    })
  })
})
