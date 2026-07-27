import { RankingQueryService } from './ranking-query.service'

describe('RankingQueryService', () => {
  it('delegates guest open-period discovery to the public query service', async () => {
    const publicQuery = { getOpenPeriods: jest.fn().mockResolvedValue({ items: [] }) }
    const service = new RankingQueryService({} as never, publicQuery as never, {} as never)

    await expect(service.getOpenPeriods('Shonen Jump', 'WEEKLY')).resolves.toEqual({ items: [] })
    expect(publicQuery.getOpenPeriods).toHaveBeenCalledWith('Shonen Jump', 'WEEKLY')
  })
})
