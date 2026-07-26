import {
  AiEnqueueFailedException,
  AiJobNotApplicableException,
  AiJobNotFoundException,
  AiJobSourceStaleException,
  AiNotEnabledException,
  AiSourceCanvasMismatchException,
  PageHasNoFileException,
  SegmentJobAlreadyRunningException
} from '../errors/ai.errors'
import envConfig from 'src/core/config/envConfig'
import { StageLockedException, StageRequiredException } from 'src/modules/chapter/errors/production-stage.errors'
import { AiSegmentService } from './ai-segment.service'

const MID = 'e'.repeat(24)
const PID = 'b'.repeat(24)
const JID = 'a'.repeat(24)
const CID = 'c'.repeat(24)
const SID = 'd'.repeat(24)
const page = { id: PID, chapterId: CID, originalFile: 'uploads/x.png', chapter: { series: { mangakaId: MID } } }

function makeService(
  overrides: {
    repo?: object
    region?: object
    queue?: object
    state?: object
    stages?: object
    enabled?: boolean | null
  } = {}
) {
  const repo = {
    createJob: jest.fn().mockResolvedValue({ id: JID, status: 'QUEUED' }),
    findOpenSegmentJob: jest.fn().mockResolvedValue(null),
    findJobById: jest.fn(),
    listJobsByPage: jest.fn().mockResolvedValue([]),
    markApplied: jest.fn().mockResolvedValue({}),
    findPageCanvas: jest.fn().mockResolvedValue({
      id: PID,
      originalFile: 'uploads/x.png',
      canvasWidth: 100,
      canvasHeight: 200
    }),
    ...overrides.repo
  }
  const region = {
    assertPageOwner: jest.fn().mockResolvedValue(page),
    applyAiRegions: jest.fn().mockResolvedValue({ created: 2, removed: 1, skipped: 0 }),
    ...overrides.region
  }
  const queue = { enqueue: jest.fn().mockResolvedValue(undefined), ...overrides.queue }
  const state = { transition: jest.fn().mockResolvedValue(true), ...overrides.state }
  const stages = {
    countByChapter: jest.fn().mockResolvedValue(0),
    findById: jest.fn(),
    findStagePage: jest.fn(),
    ...(overrides.stages ?? {})
  }
  const service = new AiSegmentService(repo as never, region as never, queue as never, state as never, stages)
  if (overrides.enabled !== null) {
    jest
      .spyOn(service as unknown as { isEnabled: () => boolean }, 'isEnabled')
      .mockReturnValue(overrides.enabled ?? true)
  }
  return { service, repo, region, queue, state, stages }
}

describe('AiSegmentService.requestSegment', () => {
  afterEach(() => jest.restoreAllMocks())

  it('creates job, enqueues, and returns jobId', async () => {
    const { service, queue, repo } = makeService()
    const result = await service.requestSegment(MID, PID, { mode: 'MODEL' })
    expect(result).toEqual({ jobId: JID, status: 'QUEUED' })
    expect(repo.createJob).toHaveBeenCalledWith({
      type: 'SEGMENT',
      mode: 'MODEL',
      pageId: PID,
      requestedBy: MID,
      sourceType: 'ORIGINAL',
      sourceFileKey: 'uploads/x.png',
      sourceRevision: 1,
      sourceStageId: undefined
    })
    expect(queue.enqueue).toHaveBeenCalledWith('ai', 'segment-page', { aiJobId: JID }, expect.any(Object))
  })

  it('422 when page has no originalFile', async () => {
    const { service } = makeService({
      region: { assertPageOwner: jest.fn().mockResolvedValue({ ...page, originalFile: null }) }
    })
    await expect(service.requestSegment(MID, PID, { mode: 'MODEL' })).rejects.toBe(PageHasNoFileException)
  })

  it('503 when AI disabled', async () => {
    const { service } = makeService({ enabled: false })
    await expect(service.requestSegment(MID, PID, { mode: 'MODEL' })).rejects.toBe(AiNotEnabledException)
  })

  it('keeps AI disabled in test even when a local .env provides an AI URL', async () => {
    const originalUrl = envConfig.AI_SERVICE_URL
    envConfig.AI_SERVICE_URL = 'https://ai.example.test'
    const { service, repo, queue } = makeService({ enabled: null })

    try {
      await expect(service.requestSegment(MID, PID, { mode: 'MODEL' })).rejects.toBe(AiNotEnabledException)
      expect(repo.createJob).not.toHaveBeenCalled()
      expect(queue.enqueue).not.toHaveBeenCalled()
    } finally {
      envConfig.AI_SERVICE_URL = originalUrl
    }
  })

  it('409 when a segment job is already open', async () => {
    const { service } = makeService({ repo: { findOpenSegmentJob: jest.fn().mockResolvedValue({ id: 'x' }) } })
    await expect(service.requestSegment(MID, PID, { mode: 'MODEL' })).rejects.toBe(SegmentJobAlreadyRunningException)
  })

  it('snapshots the active StagePage composite input', async () => {
    const stage = { id: SID, chapterId: CID, status: 'ACTIVE', name: 'DETAILING', isFinalCheck: false }
    const { service, repo } = makeService({
      stages: {
        countByChapter: jest.fn().mockResolvedValue(1),
        findById: jest.fn().mockResolvedValue(stage),
        findStagePage: jest.fn().mockResolvedValue({
          inputSourceType: 'COMPOSITE',
          inputFileKey: 'uploads/inking-output.png',
          inputRevision: 2
        })
      }
    })
    await service.requestSegment(MID, PID, { mode: 'MODEL', stageId: SID })
    expect(repo.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'COMPOSITE',
        sourceFileKey: 'uploads/inking-output.png',
        sourceRevision: 2,
        sourceStageId: SID
      })
    )
  })

  it('requires stageId for a stage-mode chapter and rejects a locked stage', async () => {
    const stage = { id: SID, chapterId: CID, status: 'LOCKED', name: 'DETAILING', isFinalCheck: false }
    const { service } = makeService({
      stages: { countByChapter: jest.fn().mockResolvedValue(1), findById: jest.fn().mockResolvedValue(stage) }
    })
    await expect(service.requestSegment(MID, PID, { mode: 'MODEL' })).rejects.toBe(StageRequiredException)
    await expect(service.requestSegment(MID, PID, { mode: 'MODEL', stageId: SID })).rejects.toBe(StageLockedException)
  })

  it('marks job FAILED and throws 503 when enqueue rejects', async () => {
    const { service, state } = makeService({ queue: { enqueue: jest.fn().mockRejectedValue(new Error('down')) } })
    await expect(service.requestSegment(MID, PID, { mode: 'MODEL' })).rejects.toBe(AiEnqueueFailedException)
    expect(state.transition).toHaveBeenCalledWith(
      JID,
      ['QUEUED'],
      'FAILED',
      expect.objectContaining({ error: expect.any(String) })
    )
  })
})

describe('AiSegmentService.getJob / applyJob', () => {
  afterEach(() => jest.restoreAllMocks())
  const successJob = {
    id: JID,
    type: 'SEGMENT',
    mode: 'MODEL',
    pageId: PID,
    requestedBy: MID,
    status: 'SUCCEEDED',
    error: null,
    modelVersion: 'x@1',
    regionCount: 1,
    appliedAt: null,
    startedAt: new Date(),
    finishedAt: new Date(),
    durationMs: 1200,
    createdAt: new Date(),
    sourceType: 'ORIGINAL',
    sourceFileKey: 'uploads/x.png',
    sourceRevision: 1,
    sourceStageId: null,
    sourceWidth: 100,
    sourceHeight: 200,
    proposedRegions: [
      {
        regionType: 'PANEL',
        detectedSubtype: 'frame',
        coordinates: { x: 0, y: 0, width: 5, height: 5 },
        confidenceScore: 0.8
      }
    ]
  }

  it('getJob returns 404 for malformed id, other user, and missing', async () => {
    const { service, repo } = makeService({ repo: { findJobById: jest.fn().mockResolvedValue(null) } })
    await expect(service.getJob(MID, 'garbage')).rejects.toBe(AiJobNotFoundException)
    await expect(service.getJob(MID, JID)).rejects.toBe(AiJobNotFoundException)
    repo.findJobById.mockResolvedValue({ ...successJob, requestedBy: 'z'.repeat(24) })
    await expect(service.getJob(MID, JID)).rejects.toBe(AiJobNotFoundException)
  })

  it('applyJob writes regions and marks applied', async () => {
    const { service, region, repo } = makeService({ repo: { findJobById: jest.fn().mockResolvedValue(successJob) } })
    const result = await service.applyJob(MID, JID)
    expect(region.applyAiRegions).toHaveBeenCalledWith(PID, successJob.proposedRegions, { aiModelVersion: 'x@1' })
    expect(repo.markApplied).toHaveBeenCalledWith(JID)
    expect(result).toMatchObject({ created: 2, removed: 1, skipped: 0, message: expect.any(String) })
    expect(region.assertPageOwner).toHaveBeenCalledWith(MID, PID)
  })

  it('listJobs opts out of editability because it is read-only', async () => {
    const { service, region } = makeService()
    await expect(service.listJobs(MID, PID, { type: 'SEGMENT' })).resolves.toEqual({ items: [] })
    expect(region.assertPageOwner).toHaveBeenCalledWith(MID, PID, { checkHold: false, checkEditable: false })
  })

  it('applyJob returns 409 when job is not SUCCEEDED', async () => {
    const { service } = makeService({
      repo: { findJobById: jest.fn().mockResolvedValue({ ...successJob, status: 'FAILED' }) }
    })
    await expect(service.applyJob(MID, JID)).rejects.toBe(AiJobNotApplicableException)
  })

  it('applyJob rejects stale stage snapshots and canvas mismatches', async () => {
    const stageJob = { ...successJob, sourceStageId: SID, sourceType: 'COMPOSITE', sourceRevision: 2 }
    const { service: staleService } = makeService({
      repo: { findJobById: jest.fn().mockResolvedValue(stageJob) },
      stages: { findById: jest.fn().mockResolvedValue({ id: SID, status: 'COMPLETED' }) }
    })
    await expect(staleService.applyJob(MID, JID)).rejects.toBe(AiJobSourceStaleException)

    const { service: mismatchService } = makeService({
      repo: {
        findJobById: jest.fn().mockResolvedValue(successJob),
        findPageCanvas: jest.fn().mockResolvedValue({
          id: PID,
          originalFile: 'uploads/x.png',
          canvasWidth: 120,
          canvasHeight: 200
        })
      }
    })
    await expect(mismatchService.applyJob(MID, JID)).rejects.toBe(AiSourceCanvasMismatchException)
  })
})
