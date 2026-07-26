import type { Prisma } from '@prisma/client'
import {
  assertRolloutApproval,
  batch,
  type CommandClient,
  countFrom,
  type GuestVoteRolloutReport,
  LEGACY_VOTE_REDIS_PATTERNS,
  type RolloutRedis
} from './audit-rollout.types'

type DuplicateRow = { duplicateIds?: Prisma.InputJsonValue[] }

export class GuestVoteRolloutService {
  constructor(private readonly mongo: CommandClient) {}

  async preflight(): Promise<GuestVoteRolloutReport> {
    const [duplicateEffectiveIdentityMethods, missingAuthMethod, missingIpHash, legacyVoteOtpRequests] =
      await Promise.all([
        this.count('VoteOtp', [
          {
            $group: {
              _id: { identityHash: '$identityHash', authMethod: { $ifNull: ['$authMethod', 'EMAIL_OTP'] } },
              count: { $sum: 1 }
            }
          },
          { $match: { count: { $gt: 1 } } }
        ]),
        this.count('VoteOtp', [{ $match: { $expr: { $eq: [{ $type: '$authMethod' }, 'missing'] } } }]),
        this.count('VoteOtp', [
          {
            $match: {
              $expr: {
                $or: [{ $eq: [{ $type: '$ipHash' }, 'missing'] }, { $eq: ['$ipHash', null] }, { $eq: ['$ipHash', ''] }]
              }
            }
          }
        ]),
        this.count('OtpRequest', [{ $match: { purpose: 'VOTE' } }])
      ])
    return { duplicateEffectiveIdentityMethods, missingAuthMethod, missingIpHash, legacyVoteOtpRequests }
  }

  async remediate(options: {
    apply: boolean
    approval?: string
    redis?: RolloutRedis
  }): Promise<GuestVoteRolloutReport & { duplicateRowsRemoved: number; legacyRedisKeysRemoved: number }> {
    assertRolloutApproval(options)
    const before = await this.preflight()
    if (!options.apply) return { ...before, duplicateRowsRemoved: 0, legacyRedisKeysRemoved: 0 }
    const duplicateIds = await this.findDuplicateIds()
    if (duplicateIds.length > 0) {
      await this.mongo.$runCommandRaw({
        delete: 'VoteOtp',
        deletes: [{ q: { _id: { $in: duplicateIds } }, limit: 0 }]
      })
    }
    await this.mongo.$runCommandRaw({
      delete: 'VoteOtp',
      deletes: [{ q: { $or: [{ ipHash: { $exists: false } }, { ipHash: null }, { ipHash: '' }] }, limit: 0 }]
    })
    await this.mongo.$runCommandRaw({
      update: 'VoteOtp',
      updates: [{ q: { authMethod: { $exists: false } }, u: { $set: { authMethod: 'EMAIL_OTP' } }, multi: true }]
    })
    await this.mongo.$runCommandRaw({
      delete: 'OtpRequest',
      deletes: [{ q: { purpose: 'VOTE' }, limit: 0 }]
    })
    const legacyRedisKeysRemoved = options.redis ? await this.cleanupLegacyRedis(options.redis) : 0
    return { ...before, duplicateRowsRemoved: duplicateIds.length, legacyRedisKeysRemoved }
  }

  async verifyPrivacy(redis?: RolloutRedis) {
    const [rawVoteOtpFields, rawReaderVoteFields, legacyVoteOtpRequests] = await Promise.all([
      this.count('VoteOtp', [
        {
          $match: {
            $or: [
              { email: { $exists: true } },
              { phone: { $exists: true } },
              { ip: { $exists: true } },
              { identity: { $exists: true } },
              { recipient: { $exists: true } }
            ]
          }
        }
      ]),
      this.count('ReaderVote', [
        {
          $match: {
            $or: [
              { email: { $exists: true } },
              { phone: { $exists: true } },
              { ip: { $exists: true } },
              { identity: { $exists: true } },
              { recipient: { $exists: true } }
            ]
          }
        }
      ]),
      this.count('OtpRequest', [{ $match: { purpose: 'VOTE' } }])
    ])
    const mongoRawGuestFields = rawVoteOtpFields + rawReaderVoteFields
    const redisReport = redis ? await this.inspectRedis(redis) : { legacyRedisKeys: 0, rawVoteQueuePayloads: 0 }
    return {
      mongoRawGuestFields,
      legacyVoteOtpRequests,
      ...redisReport,
      ok:
        mongoRawGuestFields === 0 &&
        legacyVoteOtpRequests === 0 &&
        redisReport.legacyRedisKeys === 0 &&
        redisReport.rawVoteQueuePayloads === 0
    }
  }

  private async findDuplicateIds() {
    const result = await this.mongo.$runCommandRaw({
      aggregate: 'VoteOtp',
      pipeline: [
        { $sort: { createdAt: -1, _id: -1 } },
        {
          $group: {
            _id: { identityHash: '$identityHash', authMethod: { $ifNull: ['$authMethod', 'EMAIL_OTP'] } },
            ids: { $push: '$_id' },
            count: { $sum: 1 }
          }
        },
        { $match: { count: { $gt: 1 } } },
        { $project: { _id: 0, duplicateIds: { $slice: ['$ids', 1, { $subtract: ['$count', 1] }] } } }
      ],
      cursor: {}
    })
    return batch(result).flatMap((row) => (row as DuplicateRow).duplicateIds ?? [])
  }

  private async count(collection: string, pipeline: Prisma.InputJsonValue[]) {
    return countFrom(
      await this.mongo.$runCommandRaw({
        aggregate: collection,
        pipeline: [...pipeline, { $count: 'count' }],
        cursor: {}
      })
    )
  }

  private async cleanupLegacyRedis(redis: RolloutRedis) {
    let removed = 0
    for (const pattern of LEGACY_VOTE_REDIS_PATTERNS) {
      removed += await this.scan(redis, pattern, (keys) => (keys.length ? redis.unlink(...keys) : 0))
    }
    return removed
  }

  private async inspectRedis(redis: RolloutRedis) {
    let legacyRedisKeys = 0
    for (const pattern of LEGACY_VOTE_REDIS_PATTERNS) {
      legacyRedisKeys += await this.scan(redis, pattern, (keys) => keys.length)
    }
    let rawVoteQueuePayloads = 0
    await this.scan(redis, 'bull:*', async (keys) => {
      for (const key of keys) {
        if ((await redis.type(key)) !== 'hash') continue
        const payload = await redis.hget(key, 'data')
        if (
          payload &&
          /"(?:purpose|type)"\s*:\s*"VOTE"/i.test(payload) &&
          /"(?:email|phone|identity|ip|recipient)"\s*:/i.test(payload)
        ) {
          rawVoteQueuePayloads += 1
        }
      }
      return 0
    })
    return { legacyRedisKeys, rawVoteQueuePayloads }
  }

  private async scan(redis: RolloutRedis, pattern: string, consume: (keys: string[]) => number | Promise<number>) {
    let cursor = '0'
    let total = 0
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '100')
      cursor = next
      total += await consume(keys)
    } while (cursor !== '0')
    return total
  }
}
