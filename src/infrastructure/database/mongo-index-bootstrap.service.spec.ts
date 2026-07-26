import { MongoIndexBootstrapService } from './mongo-index-bootstrap.service'

describe('MongoIndexBootstrapService', () => {
  it('drops a conflicting non-TTL expiresAt index and creates the required indexes', async () => {
    const prisma = {
      $runCommandRaw: jest
        .fn()
        .mockResolvedValueOnce({
          cursor: {
            firstBatch: [
              { name: '_id_', key: { _id: 1 } },
              { name: 'VoteOtp_expiresAt_idx', key: { expiresAt: 1 } }
            ]
          }
        })
        .mockResolvedValueOnce({ cursor: { firstBatch: [] } })
        .mockResolvedValue({ ok: 1 })
    }

    await new MongoIndexBootstrapService(prisma as never).ensureVoteOtpIndexes()

    expect(prisma.$runCommandRaw).toHaveBeenCalledWith({
      dropIndexes: 'VoteOtp',
      index: 'VoteOtp_expiresAt_idx'
    })
    expect(prisma.$runCommandRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        createIndexes: 'VoteOtp',
        indexes: expect.arrayContaining([
          expect.objectContaining({
            name: 'vote_otp_expires_ttl',
            expireAfterSeconds: 0
          }),
          expect.objectContaining({
            name: 'vote_otp_identity_auth_unique',
            unique: true
          })
        ])
      })
    )
  })

  it('is idempotent when the expected TTL index already exists', async () => {
    const prisma = {
      $runCommandRaw: jest
        .fn()
        .mockResolvedValueOnce({
          cursor: {
            firstBatch: [
              {
                name: 'vote_otp_expires_ttl',
                key: { expiresAt: 1 },
                expireAfterSeconds: 0
              }
            ]
          }
        })
        .mockResolvedValueOnce({ cursor: { firstBatch: [] } })
        .mockResolvedValue({ ok: 1 })
    }

    await new MongoIndexBootstrapService(prisma as never).ensureVoteOtpIndexes()

    expect(prisma.$runCommandRaw).not.toHaveBeenCalledWith(expect.objectContaining({ dropIndexes: 'VoteOtp' }))
  })

  it('fails preflight rather than silently deleting duplicate OTP records', async () => {
    const prisma = {
      $runCommandRaw: jest
        .fn()
        .mockResolvedValueOnce({ cursor: { firstBatch: [] } })
        .mockResolvedValueOnce({
          cursor: {
            firstBatch: [{ _id: { identityHash: 'hash', authMethod: 'EMAIL_OTP' }, count: 2 }]
          }
        })
    }

    await expect(new MongoIndexBootstrapService(prisma as never).ensureVoteOtpIndexes()).rejects.toThrow(
      'duplicate VoteOtp'
    )
  })

  it('fails transfer preflight when required object-id core fields need backfill', async () => {
    const prisma = {
      $runCommandRaw: jest.fn().mockResolvedValue({
        cursor: { firstBatch: [{ _id: 'invalid-transfer-contract' }] }
      })
    }

    await expect(new MongoIndexBootstrapService(prisma as never).ensureTransferIndexes()).rejects.toThrow(
      'TransferContract core fields require backfill'
    )
    expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(1)
  })

  it('fails transfer preflight on duplicate transfer request identities before creating an index', async () => {
    const prisma = {
      $runCommandRaw: jest
        .fn()
        .mockResolvedValueOnce({ cursor: { firstBatch: [] } })
        .mockResolvedValueOnce({ cursor: { firstBatch: [{ _id: 'request-1', count: 2 }] } })
    }

    await expect(new MongoIndexBootstrapService(prisma as never).ensureTransferIndexes()).rejects.toThrow(
      'duplicate TransferContract.transferRequestId'
    )
    expect(prisma.$runCommandRaw).not.toHaveBeenCalledWith(
      expect.objectContaining({ createIndexes: expect.anything() })
    )
  })

  it('fails transfer preflight on duplicate source contracts after validating the transfer-contract collection', async () => {
    const prisma = {
      $runCommandRaw: jest
        .fn()
        .mockResolvedValueOnce({ cursor: { firstBatch: [] } })
        .mockResolvedValueOnce({ cursor: { firstBatch: [] } })
        .mockRejectedValueOnce(new Error('IndexNotFound: legacy index absent'))
        .mockResolvedValueOnce({ ok: 1 })
        .mockResolvedValueOnce({ cursor: { firstBatch: [{ _id: 'request-1', count: 2 }] } })
    }

    await expect(new MongoIndexBootstrapService(prisma as never).ensureTransferIndexes()).rejects.toThrow(
      'duplicate Contract.sourceTransferRequestId'
    )
    expect(prisma.$runCommandRaw).toHaveBeenCalledWith(expect.objectContaining({ createIndexes: 'TransferContract' }))
    expect(prisma.$runCommandRaw).not.toHaveBeenCalledWith(expect.objectContaining({ createIndexes: 'Contract' }))
  })

  it('replaces legacy indexes with partial unique indexes and tolerates absent legacy indexes', async () => {
    const prisma = {
      $runCommandRaw: jest
        .fn()
        .mockResolvedValueOnce({ cursor: { firstBatch: [] } })
        .mockResolvedValueOnce({ cursor: { firstBatch: [] } })
        .mockResolvedValueOnce({ ok: 1 })
        .mockResolvedValueOnce({ ok: 1 })
        .mockResolvedValueOnce({ cursor: { firstBatch: [] } })
        .mockRejectedValueOnce('index not found')
        .mockResolvedValueOnce({ ok: 1 })
    }

    await expect(new MongoIndexBootstrapService(prisma as never).ensureTransferIndexes()).resolves.toBeUndefined()

    expect(prisma.$runCommandRaw).toHaveBeenCalledWith({
      createIndexes: 'TransferContract',
      indexes: [
        {
          key: { transferRequestId: 1 },
          name: 'transfer_contract_request_unique',
          unique: true,
          partialFilterExpression: { transferRequestId: { $type: 'objectId' } }
        }
      ]
    })
    expect(prisma.$runCommandRaw).toHaveBeenCalledWith({
      createIndexes: 'Contract',
      indexes: [
        {
          key: { sourceTransferRequestId: 1 },
          name: 'contract_source_transfer_unique',
          unique: true,
          partialFilterExpression: { sourceTransferRequestId: { $type: 'objectId' } }
        }
      ]
    })
  })

  it('preserves unexpected errors while dropping a legacy transfer index', async () => {
    const failure = new Error('database authorization denied')
    const prisma = {
      $runCommandRaw: jest
        .fn()
        .mockResolvedValueOnce({ cursor: { firstBatch: [] } })
        .mockResolvedValueOnce({ cursor: { firstBatch: [] } })
        .mockRejectedValueOnce(failure)
    }

    await expect(new MongoIndexBootstrapService(prisma as never).ensureTransferIndexes()).rejects.toBe(failure)
  })

  it('handles malformed list-index responses conservatively by creating both OTP indexes', async () => {
    const prisma = {
      $runCommandRaw: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ cursor: { firstBatch: 'not-an-array' } })
        .mockResolvedValueOnce({ ok: 1 })
    }

    await new MongoIndexBootstrapService(prisma as never).ensureVoteOtpIndexes()

    expect(prisma.$runCommandRaw).toHaveBeenLastCalledWith({
      createIndexes: 'VoteOtp',
      indexes: expect.arrayContaining([
        expect.objectContaining({ name: 'vote_otp_expires_ttl' }),
        expect.objectContaining({ name: 'vote_otp_identity_auth_unique' })
      ])
    })
  })
})
