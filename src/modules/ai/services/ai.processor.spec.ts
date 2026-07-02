import { AiProcessor } from './ai.processor'

const JID = 'a'.repeat(24)
const PID = 'b'.repeat(24)
const aiJob = { id: JID, pageId: PID, mode: 'MODEL', status: 'QUEUED', startedAt: null }
const segmentResult = {
  modelVersion: 'm109@1',
  imageWidth: 100,
  imageHeight: 200,
  regions: [{ type: 'PANEL', subtype: 'frame', bbox: { x: 1, y: 2, width: 3, height: 4 }, confidence: 0.7 }]
}
const makeJob = (attemptsMade = 0, attempts = 3) =>
  ({ name: 'segment-page', data: { aiJobId: JID }, attemptsMade, opts: { attempts } }) as never

function makeProcessor(overrides: { repo?: object; client?: object } = {}) {
  const repo = {
    findJobById: jest.fn().mockResolvedValue(aiJob),
    findPageFile: jest.fn().mockResolvedValue({ id: PID, originalFile: 'uploads/x.png' }),
    ...overrides.repo
  }
  const state = { transition: jest.fn().mockResolvedValue(true) }
  const storage = { createPresignedDownload: jest.fn().mockResolvedValue({ downloadUrl: 'https://r2/signed' }) }
  const client = { segment: jest.fn().mockResolvedValue(segmentResult), ...overrides.client }
  return {
    processor: new AiProcessor(repo as never, state as never, storage as never, client),
    repo,
    state,
    storage,
    client
  }
}

describe('AiProcessor', () => {
  it('success transitions RUNNING to SUCCEEDED with mapped proposedRegions', async () => {
    const { processor, state, client, storage } = makeProcessor()
    await processor.process(makeJob())
    expect(storage.createPresignedDownload).toHaveBeenCalledWith('uploads/x.png')
    expect(client.segment).toHaveBeenCalledWith({ imageUrl: 'https://r2/signed', mode: 'MODEL' })
    expect(state.transition).toHaveBeenCalledWith(JID, ['QUEUED', 'RUNNING'], 'RUNNING', expect.any(Object))
    expect(state.transition).toHaveBeenLastCalledWith(
      JID,
      ['RUNNING'],
      'SUCCEEDED',
      expect.objectContaining({
        modelVersion: 'm109@1',
        regionCount: 1,
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

  it('page without originalFile fails without calling client', async () => {
    const { processor, state, client } = makeProcessor({
      repo: { findPageFile: jest.fn().mockResolvedValue({ id: PID, originalFile: null }) }
    })
    await processor.process(makeJob())
    expect(client.segment).not.toHaveBeenCalled()
    expect(state.transition).toHaveBeenLastCalledWith(
      JID,
      ['QUEUED', 'RUNNING'],
      'FAILED',
      expect.objectContaining({ error: expect.any(String) })
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
    expect(client.segment).not.toHaveBeenCalled()
  })
})
