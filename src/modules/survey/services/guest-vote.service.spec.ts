import { GuestVoteService } from './guest-vote.service'

describe('GuestVoteService', () => {
  it('delegates each public guest-voting use case without changing sensitive input', async () => {
    const otpRequestService = { requestOtp: jest.fn().mockResolvedValue({ message: 'sent' }) }
    const readerVoteService = { submitVote: jest.fn().mockResolvedValue({ id: 'vote-1' }) }
    const voteTallyService = { getLiveTally: jest.fn().mockResolvedValue([{ seriesId: 'series-1', voteCount: 2 }]) }
    const service = new GuestVoteService(
      otpRequestService as never,
      readerVoteService as never,
      voteTallyService as never
    )
    const otpBody = { identity: 'reader@example.com', captchaToken: 'captcha' }
    const voteBody = { identity: 'reader@example.com', otpCode: '123456' }

    await expect(service.requestOtp(otpBody as never, '203.0.113.7')).resolves.toEqual({ message: 'sent' })
    await expect(service.submitVote(voteBody as never, '203.0.113.7')).resolves.toEqual({ id: 'vote-1' })
    await expect(service.getLiveTally('period-1')).resolves.toEqual([{ seriesId: 'series-1', voteCount: 2 }])

    expect(otpRequestService.requestOtp).toHaveBeenCalledWith(otpBody, '203.0.113.7')
    expect(readerVoteService.submitVote).toHaveBeenCalledWith(voteBody, '203.0.113.7')
    expect(voteTallyService.getLiveTally).toHaveBeenCalledWith('period-1')
  })
})
