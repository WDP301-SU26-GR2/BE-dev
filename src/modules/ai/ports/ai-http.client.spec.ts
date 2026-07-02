import { AiHttpClient } from './ai-http.client'

describe('AiHttpClient', () => {
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
    const client = new AiHttpClient()

    const result = await client.segment({ imageUrl: 'https://r2/x.png', mode: 'HEURISTIC' })

    expect(result.regions).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url as string).toContain('/v1/segment')
    expect((init!.headers as Record<string, string>)['x-api-key']).toBeDefined()
    expect(JSON.parse(init!.body as string)).toEqual({ imageUrl: 'https://r2/x.png', mode: 'HEURISTIC' })
  })

  it('throws on non-2xx and contract-invalid body', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'boom' })
    } as unknown as Response)
    await expect(new AiHttpClient().segment({ imageUrl: 'u', mode: 'MODEL' })).rejects.toThrow('ai-service 500')

    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ nope: true }) } as unknown as Response)
    await expect(new AiHttpClient().segment({ imageUrl: 'u', mode: 'MODEL' })).rejects.toThrow()
  })
})
