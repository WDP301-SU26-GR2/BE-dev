import { SurveyOtpService } from './survey-otp.service'
import { IdentityHashService } from 'src/infrastructure/crypto/identity-hash.service'

describe('SurveyOtpService', () => {
  const identityHashService = new IdentityHashService('test-pepper')

  function setup() {
    const voteOtpRepository = {
      upsertActiveOtp: jest.fn().mockResolvedValue({ id: 'otp-1' }),
      deleteOtpIfCurrent: jest.fn().mockResolvedValue({ count: 1 }),
      findActiveOtp: jest.fn(),
      incrementAttempts: jest.fn().mockResolvedValue(undefined),
      createVoteAndConsumeOtp: jest.fn().mockResolvedValue({ committed: true })
    }
    const hashingService = {
      hash: jest.fn().mockResolvedValue('bcrypt-hash'),
      compare: jest.fn().mockResolvedValue(true)
    }
    const delivery = {
      deliverEmailOtp: jest.fn().mockResolvedValue(undefined)
    }
    const service = new SurveyOtpService(voteOtpRepository as never, hashingService, identityHashService, delivery)
    return { service, voteOtpRepository, hashingService, delivery }
  }

  it('normalizes identity and stores only HMAC identity/IP hashes', async () => {
    const { service, voteOtpRepository, delivery } = setup()

    await service.issueEmailOtp({
      identity: '  Reader@Example.COM ',
      ip: '203.0.113.7',
      expirySeconds: 300,
      maxAttempts: 3
    })

    expect(voteOtpRepository.upsertActiveOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        identityHash: identityHashService.hash('reader@example.com'),
        ipHash: identityHashService.hash('203.0.113.7'),
        authMethod: 'EMAIL_OTP',
        otpCodeHash: 'bcrypt-hash',
        attempts: 0
      })
    )
    expect(JSON.stringify(voteOtpRepository.upsertActiveOtp.mock.calls)).not.toContain('Reader@Example.COM')
    expect(delivery.deliverEmailOtp).toHaveBeenCalledWith(expect.objectContaining({ recipient: 'reader@example.com' }))
  })

  it('removes the new OTP when direct delivery fails', async () => {
    const { service, voteOtpRepository, delivery } = setup()
    delivery.deliverEmailOtp.mockRejectedValueOnce(new Error('provider unavailable'))

    await expect(
      service.issueEmailOtp({
        identity: 'reader@example.com',
        ip: '203.0.113.7',
        expirySeconds: 300,
        maxAttempts: 3
      })
    ).rejects.toThrow('provider unavailable')

    expect(voteOtpRepository.deleteOtpIfCurrent).toHaveBeenCalledWith('otp-1', 'bcrypt-hash')
  })

  it('delegates OTP claim and ReaderVote insert to one repository transaction', async () => {
    const { service, voteOtpRepository } = setup()
    voteOtpRepository.findActiveOtp.mockResolvedValue({
      id: 'otp-1',
      otpCodeHash: 'bcrypt-hash',
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      isUsed: false
    })

    await service.createVoteWithOtp({
      identity: 'READER@example.com',
      code: '123456',
      vote: {
        surveyPeriodId: '507f1f77bcf86cd799439011',
        seriesIds: ['507f1f77bcf86cd799439021'],
        identityHash: identityHashService.hash('reader@example.com'),
        publicationType: 'WEEKLY',
        authMethod: 'EMAIL_OTP',
        ipHash: identityHashService.hash('203.0.113.7'),
        captchaScore: null,
        voteWeight: 1,
        isFlagged: false
      }
    })

    expect(voteOtpRepository.createVoteAndConsumeOtp).toHaveBeenCalledWith(expect.objectContaining({ otpId: 'otp-1' }))
  })

  it('does not attempt the transaction when the OTP code is invalid', async () => {
    const { service, voteOtpRepository, hashingService } = setup()
    voteOtpRepository.findActiveOtp.mockResolvedValue({
      id: 'otp-1',
      otpCodeHash: 'bcrypt-hash',
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      isUsed: false
    })
    hashingService.compare.mockResolvedValueOnce(false)

    await expect(
      service.createVoteWithOtp({
        identity: 'reader@example.com',
        code: '000000',
        vote: {
          surveyPeriodId: '507f1f77bcf86cd799439011',
          seriesIds: ['507f1f77bcf86cd799439021'],
          identityHash: identityHashService.hash('reader@example.com'),
          publicationType: 'WEEKLY',
          authMethod: 'EMAIL_OTP',
          ipHash: identityHashService.hash('203.0.113.7'),
          captchaScore: null,
          voteWeight: 1,
          isFlagged: false
        }
      })
    ).rejects.toBeDefined()

    expect(voteOtpRepository.incrementAttempts).toHaveBeenCalledWith('otp-1')
    expect(voteOtpRepository.createVoteAndConsumeOtp).not.toHaveBeenCalled()
  })

  it('rejects a raw identity that does not match the vote identity hash before reading OTP state', async () => {
    const { service, voteOtpRepository } = setup()

    await expect(
      service.createVoteWithOtp({
        identity: 'attacker@example.com',
        code: '123456',
        vote: {
          surveyPeriodId: '507f1f77bcf86cd799439011',
          seriesIds: ['507f1f77bcf86cd799439021'],
          identityHash: identityHashService.hash('reader@example.com'),
          publicationType: null,
          authMethod: 'EMAIL_OTP',
          ipHash: identityHashService.hash('203.0.113.7'),
          captchaScore: null,
          voteWeight: 1,
          isFlagged: false
        }
      })
    ).rejects.toBeDefined()

    expect(voteOtpRepository.findActiveOtp).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', null],
    [
      'used',
      {
        id: 'otp-1',
        otpCodeHash: 'bcrypt-hash',
        attempts: 0,
        expiresAt: new Date(Date.now() + 60_000),
        isUsed: true
      }
    ],
    [
      'expired',
      {
        id: 'otp-1',
        otpCodeHash: 'bcrypt-hash',
        attempts: 0,
        expiresAt: new Date(Date.now() - 1),
        isUsed: false
      }
    ],
    [
      'attempt limit reached',
      {
        id: 'otp-1',
        otpCodeHash: 'bcrypt-hash',
        attempts: 2,
        expiresAt: new Date(Date.now() + 60_000),
        isUsed: false
      }
    ]
  ])('rejects an OTP that is %s without comparing the code', async (_label, otp) => {
    const { service, voteOtpRepository, hashingService } = setup()
    voteOtpRepository.findActiveOtp.mockResolvedValue(otp)

    await expect(
      service.createVoteWithOtp({
        identity: 'reader@example.com',
        code: '123456',
        maxAttempts: 2,
        vote: {
          surveyPeriodId: '507f1f77bcf86cd799439011',
          seriesIds: ['507f1f77bcf86cd799439021'],
          identityHash: identityHashService.hash('reader@example.com'),
          publicationType: null,
          authMethod: 'EMAIL_OTP',
          ipHash: identityHashService.hash('203.0.113.7'),
          captchaScore: null,
          voteWeight: 1,
          isFlagged: false
        }
      })
    ).rejects.toBeDefined()

    expect(hashingService.compare).not.toHaveBeenCalled()
  })

  it('rejects when the atomic repository claim loses a race', async () => {
    const { service, voteOtpRepository } = setup()
    voteOtpRepository.findActiveOtp.mockResolvedValue({
      id: 'otp-1',
      otpCodeHash: 'bcrypt-hash',
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      isUsed: false
    })
    voteOtpRepository.createVoteAndConsumeOtp.mockResolvedValueOnce({ committed: false })

    await expect(
      service.createVoteWithOtp({
        identity: 'reader@example.com',
        code: '123456',
        vote: {
          surveyPeriodId: '507f1f77bcf86cd799439011',
          seriesIds: ['507f1f77bcf86cd799439021'],
          identityHash: identityHashService.hash('reader@example.com'),
          publicationType: null,
          authMethod: 'EMAIL_OTP',
          ipHash: identityHashService.hash('203.0.113.7'),
          captchaScore: null,
          voteWeight: 1,
          isFlagged: false
        }
      })
    ).rejects.toBeDefined()
  })
})
