import {
  AuditRolloutService,
  LEGACY_VOTE_REDIS_PATTERNS,
  ROLLOUT_APPROVAL,
  type RolloutRedis
} from './audit-rollout.service'
import type { CommandClient, IndexInspectionClient } from './audit-rollout.types'
import { GuestVoteRolloutService } from './guest-vote-rollout.service'
import { RolloutIndexVerificationService } from './rollout-index-verification.service'
import { TransferRolloutService } from './transfer-rollout.service'

const cursor = (rows: unknown[] = []) => ({ cursor: { firstBatch: rows } })
const setup = (run: jest.Mock, indexes?: IndexInspectionClient) => {
  const mongo = { $runCommandRaw: run } as CommandClient
  const indexInspection =
    indexes ??
    ({
      listIndexes: () => Promise.resolve([])
    } satisfies IndexInspectionClient)
  return new AuditRolloutService(
    new TransferRolloutService(mongo),
    new GuestVoteRolloutService(mongo),
    new RolloutIndexVerificationService(indexInspection)
  )
}

describe('AuditRolloutService', () => {
  it('produces a read-only preflight report without mutation commands', async () => {
    const run = jest.fn().mockResolvedValue(cursor())
    const result = await setup(run).preflight()

    expect(result.transfer.invalidSignatureRoles).toBe(0)
    expect(result.guestVote.legacyVoteOtpRequests).toBe(0)
    expect(run).toHaveBeenCalledTimes(14)
    for (const [command] of run.mock.calls as Array<[Record<string, unknown>]>) {
      expect(command).toHaveProperty('aggregate')
      expect(command).not.toHaveProperty('update')
      expect(command).not.toHaveProperty('delete')
    }
  })

  it('verifies all required Mongo indexes and rejects a conflicting regular expiry index', async () => {
    const listIndexes = jest
      .fn()
      .mockResolvedValueOnce([
        { key: { transferRequestId: 1 }, unique: true, partialFilterExpression: { transferRequestId: {} } }
      ])
      .mockResolvedValueOnce([
        {
          key: { sourceTransferRequestId: 1 },
          unique: true,
          partialFilterExpression: { sourceTransferRequestId: {} }
        }
      ])
      .mockResolvedValueOnce([
        { key: { identityHash: 1, authMethod: 1 }, unique: true },
        { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
        { key: { expiresAt: 1 }, name: 'legacy_regular_expiry' }
      ])
    const result = await setup(jest.fn(), { listIndexes }).verify('indexes')
    expect(result).toMatchObject({
      ok: false,
      transferContractRequestUnique: true,
      contractSourceTransferPartialUnique: true,
      voteOtpIdentityMethodUnique: true,
      voteOtpExpiresTtl: true,
      conflictingVoteOtpExpiresIndexes: 1
    })
  })

  it('keeps Guest Vote remediation dry-run/read-only by default', async () => {
    const run = jest.fn().mockResolvedValue(cursor())
    const result = await setup(run).remediateGuestVote({ apply: false })

    expect(result.duplicateRowsRemoved).toBe(0)
    expect(result.legacyRedisKeysRemoved).toBe(0)
    expect(run).toHaveBeenCalledTimes(4)
  })

  it('refuses every apply operation without the exact approval token', async () => {
    const service = setup(jest.fn())
    await expect(service.remediateGuestVote({ apply: true })).rejects.toThrow('Apply refused')
    await expect(
      service.remediateAcceptedTransfers({
        ids: ['0123456789abcdef01234567'],
        apply: true,
        approval: 'almost-correct'
      })
    ).rejects.toThrow('Apply refused')
  })

  it('cleans only allow-listed legacy Redis namespaces and reports counts, never key values', async () => {
    const run = jest.fn().mockResolvedValue(cursor())
    const scan = jest.fn().mockResolvedValue(['0', ['opaque-key-1']])
    const redis = {
      scan,
      type: jest.fn(),
      hget: jest.fn(),
      unlink: jest.fn().mockResolvedValue(1)
    } as unknown as RolloutRedis

    const result = await setup(run).remediateGuestVote({
      apply: true,
      approval: ROLLOUT_APPROVAL,
      redis
    })

    const scanCalls = scan.mock.calls as string[][]
    expect(scanCalls.map((call) => call[2])).toEqual(LEGACY_VOTE_REDIS_PATTERNS)
    expect(result.legacyRedisKeysRemoved).toBe(LEGACY_VOTE_REDIS_PATTERNS.length)
    expect(result).not.toHaveProperty('keys')
  })

  it('updates only explicitly selected ACCEPTED transfers that pass authoritative consistency checks', async () => {
    const id = '0123456789abcdef01234567'
    const run = jest
      .fn()
      .mockResolvedValueOnce(cursor([{ _id: { $oid: id } }]))
      .mockResolvedValueOnce({ ok: 1 })

    const result = await setup(run).remediateAcceptedTransfers({
      ids: [id, 'not-an-object-id'],
      apply: true,
      approval: ROLLOUT_APPROVAL
    })

    expect(result).toEqual({ requested: 1, eligible: 1, updated: 1, rejectedIds: [] })
    expect(run).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: 'TransferRequest',
        updates: [
          expect.objectContaining({
            q: expect.objectContaining({ status: 'ACCEPTED' }),
            u: { $set: { status: 'COMPLETED' } }
          })
        ]
      })
    )
  })

  it('detects raw VOTE queue payloads without returning payloads or Redis keys', async () => {
    const run = jest.fn().mockResolvedValueOnce(cursor()).mockResolvedValueOnce(cursor())
    let legacyScans = 0
    const redis = {
      scan: jest.fn().mockImplementation((_cursor: string, _match: string, pattern: string) => {
        if (pattern !== 'bull:*') {
          legacyScans += 1
          return Promise.resolve(['0', []])
        }
        return Promise.resolve(['0', ['bull:email:1']])
      }),
      type: jest.fn().mockResolvedValue('hash'),
      hget: jest.fn().mockResolvedValue('{"purpose":"VOTE","email":"redacted-at-source"}'),
      unlink: jest.fn()
    } as unknown as RolloutRedis

    const result = await setup(run).verify('privacy', redis)
    expect(legacyScans).toBe(LEGACY_VOTE_REDIS_PATTERNS.length)
    expect(result.rawVoteQueuePayloads).toBe(1)
    expect(result.ok).toBe(false)
    expect(result).not.toHaveProperty('payload')
    expect(result).not.toHaveProperty('keys')
  })
})
