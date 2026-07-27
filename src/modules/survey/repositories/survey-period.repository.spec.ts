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
