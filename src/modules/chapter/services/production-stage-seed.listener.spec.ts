import { ProductionStageSeedListener } from './production-stage-seed.listener'

describe('ProductionStageSeedListener', () => {
  it('ignores proposal names and incomplete chapter payloads', async () => {
    const state = { seedForChapter: jest.fn() }
    const listener = new ProductionStageSeedListener(state as never)
    await listener.handle({ seriesId: 's', nameId: 'n', kind: 'PROPOSAL' })
    await listener.handle({ seriesId: 's', nameId: 'n', kind: 'CHAPTER' })
    expect(state.seedForChapter).not.toHaveBeenCalled()
  })

  it('seeds once a chapter name approval identifies its chapter', async () => {
    const state = { seedForChapter: jest.fn().mockResolvedValue(undefined) }
    const listener = new ProductionStageSeedListener(state as never)
    await listener.handle({ seriesId: 's', nameId: 'n', kind: 'CHAPTER', chapterId: 'c1' })
    expect(state.seedForChapter).toHaveBeenCalledWith('c1')
  })
})
