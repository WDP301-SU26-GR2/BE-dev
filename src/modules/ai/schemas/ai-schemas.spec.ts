import { AiSegmentResponseSchema, SegmentPageBodySchema } from './ai-schemas'

describe('ai-schemas', () => {
  it('SegmentPageBody defaults mode, accepts stageId, and rejects client-selected sources', () => {
    expect(SegmentPageBodySchema.parse({}).mode).toBe('MODEL')
    expect(SegmentPageBodySchema.parse({ stageId: 'a'.repeat(24) }).stageId).toBe('a'.repeat(24))
    expect(() => SegmentPageBodySchema.parse({ mode: 'MAGIC' })).toThrow()
    expect(() => SegmentPageBodySchema.parse({ foo: 1 })).toThrow()
    expect(() => SegmentPageBodySchema.parse({ sourceFileKey: 'uploads/latest.png' })).toThrow()
  })

  it('AiSegmentResponse validates contract and caps regions', () => {
    const ok = AiSegmentResponseSchema.parse({
      modelVersion: 'opencv-heuristic@1.0',
      imageWidth: 100,
      imageHeight: 200,
      regions: [{ type: 'PANEL', subtype: 'frame', bbox: { x: 0, y: 0, width: 10, height: 10 }, confidence: 0.5 }]
    })
    expect(ok.regions[0].type).toBe('PANEL')
    expect(() =>
      AiSegmentResponseSchema.parse({
        modelVersion: 'x',
        imageWidth: 1,
        imageHeight: 1,
        regions: [{ type: 'PANEL', bbox: { x: 0, y: 0, width: 10, height: 10 }, confidence: 1.5 }]
      })
    ).toThrow()
  })
})
