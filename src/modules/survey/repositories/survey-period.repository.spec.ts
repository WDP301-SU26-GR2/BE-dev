import { SurveyPeriodRepository } from './survey-period.repository'

describe('SurveyPeriodRepository.findOpenPeriods', () => {
  it('queries only OPEN periods and applies optional guest scope filters', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const repository = new SurveyPeriodRepository({ surveyPeriod: { findMany } } as never)

    await repository.findOpenPeriods({ magazine: 'Shonen Jump', publicationType: 'WEEKLY' })

    expect(findMany).toHaveBeenCalledWith({
      where: { status: 'OPEN', magazine: 'Shonen Jump', publicationType: 'WEEKLY' },
      orderBy: [{ publicationType: 'asc' }, { startDate: 'desc' }]
    })
  })
})

describe('SurveyPeriodRepository.findMany', () => {
  it('applies internal filters, deterministic pagination and returns rows with a total', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'period-1' }])
    const count = jest.fn().mockResolvedValue(3)
    const repository = new SurveyPeriodRepository({ surveyPeriod: { findMany, count } } as never)

    await expect(
      repository.findMany({
        magazine: 'Jump',
        publicationType: 'WEEKLY',
        status: 'OPEN',
        limit: 10,
        offset: 20
      })
    ).resolves.toEqual({ items: [{ id: 'period-1' }], total: 3 })

    const where = { magazine: 'Jump', publicationType: 'WEEKLY', status: 'OPEN' }
    expect(findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
      take: 10,
      skip: 20
    })
    expect(count).toHaveBeenCalledWith({ where })
  })
})
