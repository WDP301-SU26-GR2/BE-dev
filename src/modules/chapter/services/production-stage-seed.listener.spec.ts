import { ProductionStageSeedListener } from './production-stage-seed.listener'

describe('ProductionStageSeedListener', () => {
  it('seeds once a chapter storyboard approval identifies its chapter', async () => {
    const state = { seedForChapter: jest.fn().mockResolvedValue(undefined) }
    const listener = new ProductionStageSeedListener(state as never)
    await listener.handle({ seriesId: 's', storyboardId: 'sb', chapterId: 'c1' })
    expect(state.seedForChapter).toHaveBeenCalledWith('c1')
  })
})
