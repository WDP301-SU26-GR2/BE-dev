import { SurveyService } from './survey.service'

describe('SurveyService public discovery facade', () => {
  it('delegates open-period discovery without altering optional filters', async () => {
    const rankingQuery = { getOpenPeriods: jest.fn().mockResolvedValue({ items: [] }) }
    const service = new SurveyService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      rankingQuery as never,
      {} as never
    )

    await expect(service.getOpenPeriods('Shonen Jump', 'WEEKLY')).resolves.toEqual({ items: [] })
    expect(rankingQuery.getOpenPeriods).toHaveBeenCalledWith('Shonen Jump', 'WEEKLY')
  })
})
