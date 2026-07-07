import { SurveyService } from './survey.service'
import { DomainEvent } from 'src/core/events/domain-events'

type Mocks = {
  surveyRepository: any
  authOtpService: any
  hashingService: any
  rateLimitService: any
  domainEventBus: any
  notificationService: any
}

function makeMocks(): Mocks {
  return {
    surveyRepository: {
      findSurveyPeriodById: jest.fn(),
      getSurveyDataByPeriod: jest.fn(),
      getReaderVotesByPeriod: jest.fn(),
      findPreviousSurveyPeriod: jest.fn(),
      createRankingRecord: jest.fn().mockResolvedValue({}),
      updateSurveyPeriodStatus: jest.fn().mockResolvedValue({})
    },
    authOtpService: { sendOTPService: jest.fn() },
    hashingService: { hash: jest.fn().mockResolvedValue('h') },
    rateLimitService: { checkAndConsume: jest.fn() },
    domainEventBus: { emit: jest.fn() },
    notificationService: { notifySafe: jest.fn().mockResolvedValue(undefined) }
  }
}

function makeService(m: Mocks) {
  return new SurveyService(
    m.surveyRepository as never,
    m.authOtpService as never,
    m.hashingService as never,
    m.rateLimitService as never,
    m.domainEventBus as never,
    m.notificationService as never
  )
}

describe('SurveyService.finalizeRanking — RankingFinalized event payload (B-VOT-07/§4.2)', () => {
  it('emits RankingFinalized with rankings[] sorted by score (rank = index+1)', async () => {
    const m = makeMocks()

    m.surveyRepository.findSurveyPeriodById.mockResolvedValue({ id: 'sp1', status: 'CLOSED' })

    m.surveyRepository.getSurveyDataByPeriod.mockResolvedValue([])

    // Two reader votes give two different series weighted scores.
    m.surveyRepository.getReaderVotesByPeriod.mockResolvedValue([
      { seriesIds: ['sA'], voteWeight: 5 },
      { seriesIds: ['sB'], voteWeight: 1 }
    ])

    m.surveyRepository.findPreviousSurveyPeriod.mockResolvedValue(null)

    await makeService(m).finalizeRanking('sp1')

    // Expect emit was called with DomainEvent.RankingFinalized and a rankings array
    // sorted descending by score. seriesId of highest score must be at rank 1.
    const emitCalls = m.domainEventBus.emit.mock.calls.filter(
      ([eventName]: [string, unknown]) => eventName === DomainEvent.RankingFinalized
    )
    expect(emitCalls).toHaveLength(1)

    const [, payload] = emitCalls[0]
    expect(payload).toMatchObject({ surveyPeriodId: 'sp1' })
    expect(payload.rankings).toEqual([
      { seriesId: 'sA', rank: 1 },
      { seriesId: 'sB', rank: 2 }
    ])
  })

  it('emits an empty rankings array when no votes/data exist', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue({ id: 'sp2', status: 'CLOSED' })
    m.surveyRepository.getSurveyDataByPeriod.mockResolvedValue([])
    m.surveyRepository.getReaderVotesByPeriod.mockResolvedValue([])
    m.surveyRepository.findPreviousSurveyPeriod.mockResolvedValue(null)

    await makeService(m).finalizeRanking('sp2')

    const emitCalls = m.domainEventBus.emit.mock.calls.filter(
      ([eventName]: [string, unknown]) => eventName === DomainEvent.RankingFinalized
    )
    expect(emitCalls).toHaveLength(1)
    const [, payload] = emitCalls[0]
    expect(payload.surveyPeriodId).toBe('sp2')
    expect(payload.rankings).toEqual([])
  })
})
