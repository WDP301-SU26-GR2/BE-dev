import { Prisma, ReaderAuthMethod } from '@prisma/client'
import { VoteOtpRepository, VotePersistenceCommand } from './vote-otp.repo'

describe('VoteOtpRepository', () => {
  const vote = {
    surveyPeriodId: 'period-1',
    seriesIds: ['series-1'],
    identityHash: 'identity-hash',
    publicationType: null,
    authMethod: ReaderAuthMethod.EMAIL_OTP,
    ipHash: 'ip-hash',
    captchaScore: null,
    voteWeight: 1,
    isFlagged: false
  } satisfies VotePersistenceCommand

  function setup() {
    const tx = {
      voteOtp: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      readerVote: { create: jest.fn().mockResolvedValue({ id: 'vote-1' }) }
    }
    const transaction: jest.Mock = jest.fn((work: (context: typeof tx) => unknown) => work(tx))
    const prisma = {
      voteOtp: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn()
      },
      $transaction: transaction
    }
    return { repository: new VoteOtpRepository(prisma as never), prisma, transaction, tx }
  }

  const command = {
    otpId: 'otp-1',
    identityHash: 'identity-hash',
    authMethod: ReaderAuthMethod.EMAIL_OTP,
    vote
  }

  it('uses the compound hashed-identity key when issuing and finding an OTP', async () => {
    const { repository, prisma } = setup()
    const data = {
      identityHash: 'identity-hash',
      otpCodeHash: 'otp-hash',
      ipHash: 'ip-hash',
      authMethod: ReaderAuthMethod.EMAIL_OTP,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      attempts: 0
    }

    await repository.upsertActiveOtp(data)
    await repository.findActiveOtp(data.identityHash, data.authMethod)
    await repository.incrementAttempts('otp-1')
    await repository.deleteOtpIfCurrent('otp-1', data.otpCodeHash)

    expect(prisma.voteOtp.upsert).toHaveBeenCalledWith({
      where: { identityHash_authMethod: { identityHash: data.identityHash, authMethod: data.authMethod } },
      update: {
        otpCodeHash: data.otpCodeHash,
        ipHash: data.ipHash,
        expiresAt: data.expiresAt,
        attempts: 0,
        isUsed: false
      },
      create: data
    })
    expect(prisma.voteOtp.findUnique).toHaveBeenCalledWith({
      where: { identityHash_authMethod: { identityHash: data.identityHash, authMethod: data.authMethod } }
    })
    expect(prisma.voteOtp.updateMany).toHaveBeenCalledWith({
      where: { id: 'otp-1', isUsed: false },
      data: { attempts: { increment: 1 } }
    })
    expect(prisma.voteOtp.deleteMany).toHaveBeenCalledWith({
      where: { id: 'otp-1', otpCodeHash: data.otpCodeHash }
    })
  })

  it('does not delete an OTP version rotated by a newer request', async () => {
    const { repository, prisma } = setup()
    prisma.voteOtp.deleteMany.mockResolvedValueOnce({ count: 0 })

    await expect(repository.deleteOtpIfCurrent('otp-1', 'stale-hash')).resolves.toEqual({ count: 0 })

    expect(prisma.voteOtp.deleteMany).toHaveBeenCalledWith({
      where: { id: 'otp-1', otpCodeHash: 'stale-hash' }
    })
  })

  it('atomically claims the OTP before inserting the vote', async () => {
    const { repository, tx } = setup()

    await expect(repository.createVoteAndConsumeOtp(command)).resolves.toEqual({ committed: true })

    expect(tx.voteOtp.updateMany).toHaveBeenCalledWith({
      where: {
        id: command.otpId,
        identityHash: command.identityHash,
        authMethod: command.authMethod,
        isUsed: false,
        expiresAt: { gt: expect.any(Date) }
      },
      data: { isUsed: true }
    })
    expect(tx.readerVote.create).toHaveBeenCalledWith({ data: vote })
    expect(tx.voteOtp.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.readerVote.create.mock.invocationCallOrder[0]
    )
  })

  it('does not insert a vote when another transaction already claimed the OTP', async () => {
    const { repository, tx } = setup()
    tx.voteOtp.updateMany.mockResolvedValueOnce({ count: 0 })

    await expect(repository.createVoteAndConsumeOtp(command)).resolves.toEqual({ committed: false })

    expect(tx.readerVote.create).not.toHaveBeenCalled()
  })

  it('retries a transient write conflict and then commits once', async () => {
    const { repository, transaction, tx } = setup()
    transaction
      .mockRejectedValueOnce(new Error('TransientTransactionError: WriteConflict'))
      .mockImplementationOnce((work: (context: typeof tx) => unknown) => work(tx))

    await expect(repository.createVoteAndConsumeOtp(command)).resolves.toEqual({ committed: true })

    expect(transaction).toHaveBeenCalledTimes(2)
    expect(tx.readerVote.create).toHaveBeenCalledTimes(1)
  })

  it('recognizes Prisma P2034 as retryable', async () => {
    const { repository, transaction, tx } = setup()
    transaction
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('transaction conflict', {
          code: 'P2034',
          clientVersion: '6.19.0'
        })
      )
      .mockImplementationOnce((work: (context: typeof tx) => unknown) => work(tx))

    await expect(repository.createVoteAndConsumeOtp(command)).resolves.toEqual({ committed: true })
    expect(transaction).toHaveBeenCalledTimes(2)
  })

  it.each([new Error('permanent database failure'), 'non-error rejection'])(
    'does not retry a non-transient failure: %s',
    async (failure) => {
      const { repository, transaction } = setup()
      transaction.mockRejectedValueOnce(failure)

      await expect(repository.createVoteAndConsumeOtp(command)).rejects.toBe(failure)
      expect(transaction).toHaveBeenCalledTimes(1)
    }
  )

  it('stops after the bounded number of transient retries', async () => {
    const { repository, transaction } = setup()
    const conflict = new Error('WriteConflict')
    transaction.mockRejectedValue(conflict)

    await expect(repository.createVoteAndConsumeOtp(command)).rejects.toBe(conflict)
    expect(transaction).toHaveBeenCalledTimes(3)
  })
})
