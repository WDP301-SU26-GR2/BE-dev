import { AiHttpClient } from './ai-http.client'

describe('AiHttpClient', () => {
  const makeMetrics = () => ({ recordAiInference: jest.fn() })
  const okBody = {
    modelVersion: 'opencv-heuristic@1.0',
    imageWidth: 100,
    imageHeight: 200,
    regions: [{ type: 'PANEL', subtype: 'frame', bbox: { x: 0, y: 0, width: 10, height: 10 }, confidence: 0.5 }]
  }

  afterEach(() => jest.restoreAllMocks())

  it('POSTs contract with x-api-key and parses valid response', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(okBody) } as unknown as Response)
    const metrics = makeMetrics()
    const client = new AiHttpClient({ getRequestId: () => undefined } as never, metrics as never)

    const result = await client.segment({ imageUrl: 'https://r2/x.png', mode: 'HEURISTIC' })

    expect(result.regions).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url as string).toContain('/v1/segment')
    expect((init!.headers as Record<string, string>)['x-api-key']).toBeDefined()
    expect(JSON.parse(init!.body as string)).toEqual({ imageUrl: 'https://r2/x.png', mode: 'HEURISTIC' })
    expect(metrics.recordAiInference).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'segment', outcome: 'success' })
    )
  })

  it('throws on non-2xx and contract-invalid body', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'boom' })
    } as unknown as Response)
    await expect(
      new AiHttpClient({ getRequestId: () => undefined } as never, makeMetrics() as never).segment({
        imageUrl: 'u',
        mode: 'MODEL'
      })
    ).rejects.toThrow('ai-service 500')

    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ nope: true }) } as unknown as Response)
    await expect(
      new AiHttpClient({ getRequestId: () => undefined } as never, makeMetrics() as never).segment({
        imageUrl: 'u',
        mode: 'MODEL'
      })
    ).rejects.toThrow()
  })

  it('records failed inference without logging request payload labels', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))
    const metrics = makeMetrics()
    const client = new AiHttpClient({ getRequestId: () => 'request-1' } as never, metrics as never)

    await expect(client.segment({ imageUrl: 'https://private/object', mode: 'MODEL' })).rejects.toThrow('network down')
    expect(metrics.recordAiInference).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'segment', outcome: 'failure' })
    )
    expect(JSON.stringify(metrics.recordAiInference.mock.calls)).not.toContain('private/object')
  })
})
