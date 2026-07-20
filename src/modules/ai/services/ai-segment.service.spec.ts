import {
  AiEnqueueFailedException,
  AiJobNotApplicableException,
  AiJobNotFoundException,
  AiNotEnabledException,
  PageHasNoFileException,
  SegmentJobAlreadyRunningException
} from '../errors/ai.errors'
import { AiSegmentService } from './ai-segment.service'

const MID = 'e'.repeat(24)
const PID = 'b'.repeat(24)
const JID = 'a'.repeat(24)
const page = { id: PID, originalFile: 'uploads/x.png', chapter: { series: { mangakaId: MID } } }

function makeService(
  overrides: { repo?: object; region?: object; queue?: object; state?: object; enabled?: boolean } = {}
) {
  const repo = {
    createJob: jest.fn().mockResolvedValue({ id: JID, status: 'QUEUED' }),
    findOpenSegmentJob: jest.fn().mockResolvedValue(null),
    findJobById: jest.fn(),
    listJobsByPage: jest.fn().mockResolvedValue([]),
    markApplied: jest.fn().mockResolvedValue({}),
    ...overrides.repo
  }
  const region = {
    assertPageOwner: jest.fn().mockResolvedValue(page),
    applyAiRegions: jest.fn().mockResolvedValue({ created: 2, removed: 1, skipped: 0 }),
    ...overrides.region
  }
  const queue = { enqueue: jest.fn().mockResolvedValue(undefined), ...overrides.queue }
  const state = { transition: jest.fn().mockResolvedValue(true), ...overrides.state }
  const service = new AiSegmentService(repo as never, region as never, queue as never, state as never)
  jest.spyOn(service as unknown as { isEnabled: () => boolean }, 'isEnabled').mockReturnValue(overrides.enabled ?? true)
  return { service, repo, region, queue, state }
}

describe('AiSegmentService.requestSegment', () => {
  afterEach(() => jest.restoreAllMocks())

  it('creates job, enqueues, and returns jobId', async () => {
    const { service, queue } = makeService()
    const result = await service.requestSegment(MID, PID, { mode: 'MODEL' })
    expect(result).toEqual({ jobId: JID, status: 'QUEUED' })
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

  it('409 when a segment job is already open', async () => {
    const { service } = makeService({ repo: { findOpenSegmentJob: jest.fn().mockResolvedValue({ id: 'x' }) } })
    await expect(service.requestSegment(MID, PID, { mode: 'MODEL' })).rejects.toBe(SegmentJobAlreadyRunningException)
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
})
