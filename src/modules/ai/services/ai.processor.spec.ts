import { AiProcessor } from './ai.processor'
import { RequestContextService } from 'src/core/observability/request-context.service'
import { QueueService } from 'src/infrastructure/queue/queue.service'
import { AiClientPort } from '../ports/ai-client.port'
import { AiHttpClient } from '../ports/ai-http.client'

const JID = 'a'.repeat(24)
const PID = 'b'.repeat(24)
const aiJob = {
  id: JID,
  pageId: PID,
  mode: 'MODEL',
  status: 'QUEUED',
  startedAt: null,
  sourceFileKey: 'uploads/snapshot.png'
}
const segmentResult = {
  modelVersion: 'm109@1',
  imageWidth: 100,
  imageHeight: 200,
  regions: [{ type: 'PANEL', subtype: 'frame', bbox: { x: 1, y: 2, width: 3, height: 4 }, confidence: 0.7 }]
}
const makeJob = (attemptsMade = 0, attempts = 3, requestId = 'request-from-queue') =>
  ({ name: 'segment-page', data: { aiJobId: JID, requestId }, attemptsMade, opts: { attempts } }) as never

// Specs pass either a jest mock or a real AiHttpClient (fetch-level test), so keep both shapes
// assignable while still exposing `segment` for assertions.
type AiClientLike = AiClientPort | { segment: jest.Mock }

function makeProcessor(
  overrides: { repo?: object; client?: AiClientLike; requestContext?: RequestContextService } = {}
) {
  const repo = {
    findJobById: jest.fn().mockResolvedValue(aiJob),
    findPageFile: jest.fn().mockResolvedValue({ id: PID, originalFile: 'uploads/x.png' }),
    findPageCanvas: jest
      .fn()
      .mockResolvedValue({ id: PID, originalFile: 'uploads/x.png', canvasWidth: 100, canvasHeight: 200 }),
    setCanvasIfUnset: jest.fn().mockResolvedValue(1),
    ...overrides.repo
  }
  const state = { transition: jest.fn().mockResolvedValue(true) }
  const storage = { createPresignedDownload: jest.fn().mockResolvedValue({ downloadUrl: 'https://r2/signed' }) }
  const client: AiClientLike = overrides.client ?? { segment: jest.fn().mockResolvedValue(segmentResult) }
  const requestContext = overrides.requestContext ?? new RequestContextService()
  const processorMetrics = {
    run: jest.fn(async (_queue: string, _job: unknown, handler: () => unknown): Promise<unknown> => await handler())
  }
  return {
    processor: new AiProcessor(
      repo as never,
      state as never,
      storage as never,
      client,
      requestContext,
      processorMetrics as never
    ),
    repo,
    state,
    storage,
    client,
    requestContext,
    processorMetrics
  }
}

describe('AiProcessor', () => {
  afterEach(() => jest.restoreAllMocks())

  it('success transitions RUNNING to SUCCEEDED with mapped proposedRegions', async () => {
    const { processor, state, client, storage, processorMetrics } = makeProcessor()
    await processor.process(makeJob())
    expect(processorMetrics.run).toHaveBeenCalledWith('ai', expect.anything(), expect.any(Function))
    expect(storage.createPresignedDownload).toHaveBeenCalledWith('uploads/snapshot.png')
    const segmentCall = (client as { segment: jest.Mock }).segment
    expect(segmentCall).toHaveBeenCalledWith({
      imageUrl: 'https://r2/signed',
      mode: 'MODEL'
    })
    expect(state.transition).toHaveBeenCalledWith(JID, ['QUEUED', 'RUNNING'], 'RUNNING', expect.any(Object))
    expect(state.transition).toHaveBeenLastCalledWith(
      JID,
      ['RUNNING'],
      'SUCCEEDED',
      expect.objectContaining({
        modelVersion: 'm109@1',
        regionCount: 1,
        sourceWidth: 100,
        sourceHeight: 200,
        proposedRegions: [
          {
            regionType: 'PANEL',
            detectedSubtype: 'frame',
            coordinates: { x: 1, y: 2, width: 3, height: 4 },
            confidenceScore: 0.7
          }
        ]
      })
    )
  })

  it('restores the queued request id while invoking the AI client', async () => {
    const { processor, client, requestContext } = makeProcessor({
      client: {
        segment: jest.fn().mockImplementation(() => {
          expect(requestContext.getRequestId()).toBe('request-from-queue')
          return Promise.resolve(segmentResult)
        })
      }
    })

    await processor.process(makeJob())

    expect((client as { segment: jest.Mock }).segment).toHaveBeenCalledTimes(1)
    expect(requestContext.getRequestId()).toBeUndefined()
  })

  it('preserves one request id from API context through the queue job to the AI HTTP header', async () => {
    const requestContext = new RequestContextService()
    let queuedData: Record<string, unknown> | undefined
    const queue = {
      add: jest.fn((_: string, data: Record<string, unknown>) => {
        queuedData = data
        return Promise.resolve({ id: 'job-1' })
      })
    }
    const queueService = new QueueService({ get: () => queue } as never, requestContext, {
      recordQueueEnqueue: jest.fn()
    } as never)
    await requestContext.run('correlation-1', () => queueService.enqueue('ai', 'segment-page', { aiJobId: JID }))

    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(segmentResult) } as Response)
    const client = new AiHttpClient(requestContext, { recordAiInference: jest.fn() } as never)
    const { processor } = makeProcessor({ client, requestContext })
    await processor.process({
      name: 'segment-page',
      data: queuedData,
      attemptsMade: 0,
      opts: { attempts: 3 }
    } as never)

    expect(queuedData?.requestId).toBe('correlation-1')
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)['x-request-id']).toBe('correlation-1')
  })

  it('legacy job without a source snapshot and no originalFile fails without calling client', async () => {
    const { processor, state, client } = makeProcessor({
      repo: {
        findJobById: jest.fn().mockResolvedValue({ ...aiJob, sourceFileKey: null }),
        findPageFile: jest.fn().mockResolvedValue({ id: PID, originalFile: null })
      }
    })
    await processor.process(makeJob())
    expect((client as { segment: jest.Mock }).segment).not.toHaveBeenCalled()
    expect(state.transition).toHaveBeenLastCalledWith(
      JID,
      ['QUEUED', 'RUNNING'],
      'FAILED',
      expect.objectContaining({ error: expect.any(String) })
    )
  })

  it('fails the job when AI dimensions do not match the existing page canvas', async () => {
    const { processor, state } = makeProcessor({
      repo: {
        findPageCanvas: jest.fn().mockResolvedValue({
          id: PID,
          originalFile: 'uploads/x.png',
          canvasWidth: 99,
          canvasHeight: 200
        })
      }
    })
    await processor.process(makeJob())
    expect(state.transition).toHaveBeenLastCalledWith(
      JID,
      ['RUNNING'],
      'FAILED',
      expect.objectContaining({ error: 'Error.AiSourceCanvasMismatch' })
    )
  })

  it('client error mid attempts rethrows for BullMQ retry', async () => {
    const { processor, state } = makeProcessor({
      client: { segment: jest.fn().mockRejectedValue(new Error('conn refused')) }
    })
    await expect(processor.process(makeJob(0, 3))).rejects.toThrow('conn refused')
    expect(state.transition).not.toHaveBeenCalledWith(JID, expect.anything(), 'FAILED', expect.anything())
  })

  it('client error on last attempt marks FAILED and swallows', async () => {
    const { processor, state } = makeProcessor({
      client: { segment: jest.fn().mockRejectedValue(new Error('conn refused')) }
    })
    await processor.process(makeJob(2, 3))
    expect(state.transition).toHaveBeenLastCalledWith(
      JID,
      ['RUNNING'],
      'FAILED',
      expect.objectContaining({ error: expect.stringContaining('conn refused') })
    )
  })

  it('missing AiJob skips quietly', async () => {
    const { processor, client } = makeProcessor({ repo: { findJobById: jest.fn().mockResolvedValue(null) } })
    await processor.process(makeJob())
    expect((client as { segment: jest.Mock }).segment).not.toHaveBeenCalled()
  })
})
