import { SurveyService } from './survey.service'
import { DomainEvent } from 'src/core/events/domain-events'
import { IdentityHashService } from 'src/infrastructure/crypto/identity-hash.service'

// Real (not mocked) so identity/ip hashing determinism is exercised end-to-end in submitVote tests.
const identityHash = new IdentityHashService('test-pepper')

type Mocks = {
  surveyRepository: any
  authOtpService: any
  identityHashService: IdentityHashService
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
      findReaderVoteByPeriodAndIdentity: jest.fn(),
      createReaderVote: jest.fn().mockResolvedValue({}),
      createRankingRecord: jest.fn().mockResolvedValue({}),
      updateSurveyPeriodStatus: jest.fn().mockResolvedValue({})
    },
    authOtpService: { sendOTPService: jest.fn(), validateOtpCode: jest.fn(), burnOtp: jest.fn() },
    identityHashService: identityHash,
    rateLimitService: { checkAndConsume: jest.fn() },
    domainEventBus: { emit: jest.fn() },
    notificationService: { notifySafe: jest.fn().mockResolvedValue(undefined) }
  }
}

function makeService(m: Mocks) {
  return new SurveyService(
    m.surveyRepository as never,
    m.authOtpService as never,
    m.identityHashService,
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

describe('SurveyService.submitVote — deterministic identity hashing (B-VOT-03)', () => {
  const OPEN_PERIOD = { id: 'sp1', status: 'OPEN' }
  const VOTE_BODY = { surveyPeriodId: 'sp1', seriesIds: ['sA'], phoneNumber: '+84900000000', otpCode: '123456' }
  const IP = '203.0.113.9'

  it('uses HMAC identityHash for BOTH the dedup lookup and the stored vote (so "1 phone = 1 vote/period" holds)', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue(OPEN_PERIOD)
    m.surveyRepository.findReaderVoteByPeriodAndIdentity.mockResolvedValue(null)

    await makeService(m).submitVote(VOTE_BODY, IP)

    const expectedIdentityHash = identityHash.hash(VOTE_BODY.phoneNumber)
    const expectedIpHash = identityHash.hash(IP)

    // dedup lookup keyed by the deterministic hash
    expect(m.surveyRepository.findReaderVoteByPeriodAndIdentity).toHaveBeenCalledWith('sp1', expectedIdentityHash)
    // stored vote carries the SAME deterministic hash (unique constraint can now catch repeats)
    expect(m.surveyRepository.createReaderVote).toHaveBeenCalledWith(
      expect.objectContaining({ identityHash: expectedIdentityHash, ipHash: expectedIpHash })
    )
  })

  it('rejects a second vote from the same phone in the same period (dedup hit)', async () => {
    const m = makeMocks()
    m.surveyRepository.findSurveyPeriodById.mockResolvedValue(OPEN_PERIOD)
    m.surveyRepository.findReaderVoteByPeriodAndIdentity.mockResolvedValue({ id: 'existing' })

    await expect(makeService(m).submitVote(VOTE_BODY as never, IP)).rejects.toBeDefined()
    expect(m.surveyRepository.createReaderVote).not.toHaveBeenCalled()
  })
})
