import { SurveyPeriodNotOpenException } from './errors/survey.errors'
import { VoteTallyService } from './services/vote-tally.service'
import { VoteGateway } from './vote.gateway'

describe('VoteGateway', () => {
  const periodId = '0123456789abcdef01234567'
  let tallyService: jest.Mocked<Pick<VoteTallyService, 'getLiveTally'>>
  let redisService: { setNxEx: jest.Mock }
  let gateway: VoteGateway

  beforeEach(() => {
    tallyService = { getLiveTally: jest.fn() }
    redisService = { setNxEx: jest.fn() }
    gateway = new VoteGateway({ duplicate: jest.fn() } as never, tallyService as never, redisService as never)
  })

  it('allows a public socket to join an OPEN scoped period and emits its snapshot', async () => {
    const tally = { periodId, tally: [], totalVotes: 0 }
    tallyService.getLiveTally.mockResolvedValue(tally as never)
    const client = { join: jest.fn(), emit: jest.fn() }

    await expect(gateway.handleJoinPeriod({ periodId }, client as never)).resolves.toEqual({ status: 'SUCCESS' })
    expect(client.join).toHaveBeenCalledWith(`vote:${periodId}`)
    expect(client.emit).toHaveBeenCalledWith('voteTally', tally)
  })

  it('does not authenticate sockets and reports closed periods without throwing', async () => {
    tallyService.getLiveTally.mockRejectedValue(SurveyPeriodNotOpenException)

    await expect(
      gateway.handleJoinPeriod({ periodId }, { join: jest.fn(), emit: jest.fn() } as never)
    ).resolves.toEqual({
      status: 'CLOSED'
    })
    await expect(gateway.handleJoinPeriod({ periodId: 'invalid' }, {} as never)).resolves.toEqual({ status: 'INVALID' })
  })

  it('throttles with Redis and swallows a socket broadcast failure after commit', async () => {
    redisService.setNxEx.mockResolvedValue(true)
    tallyService.getLiveTally.mockResolvedValue({ periodId, tally: [], totalVotes: 0 } as never)
    gateway.server = {
      to: jest.fn(() => ({
        emit: jest.fn(() => {
          throw new Error('socket down')
        })
      }))
    } as never

    await expect(gateway.broadcastTally(periodId)).resolves.toBeUndefined()
    expect(redisService.setNxEx).toHaveBeenCalledWith(`vote:tally:throttle:${periodId}`, 2)
  })

  it('closes the duplicated Socket.IO subscription connection on shutdown', async () => {
    const quit = jest.fn().mockResolvedValue('OK')
    const duplicate = jest.fn().mockReturnValue({ status: 'ready', quit })
    gateway = new VoteGateway({ duplicate } as never, tallyService as never, redisService as never)
    gateway.server = {} as never

    gateway.afterInit()
    await gateway.onApplicationShutdown()

    expect(duplicate).toHaveBeenCalledTimes(1)
    expect(quit).toHaveBeenCalledTimes(1)
  })
})
