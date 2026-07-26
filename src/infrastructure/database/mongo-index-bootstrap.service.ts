import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from './prisma.service'

type MongoCursorResult = {
  cursor?: {
    firstBatch?: unknown[]
  }
}

type MongoIndexDescription = {
  name?: string
  key?: Record<string, number>
  expireAfterSeconds?: number
  unique?: boolean
}

const cursorBatch = (result: unknown): unknown[] => {
  if (typeof result !== 'object' || result === null) return []
  const cursor = (result as MongoCursorResult).cursor
  return Array.isArray(cursor?.firstBatch) ? cursor.firstBatch : []
}

const isExpiresAtIndex = (value: unknown): value is MongoIndexDescription => {
  if (typeof value !== 'object' || value === null) return false
  const index = value as MongoIndexDescription
  return index.key?.expiresAt === 1
}

@Injectable()
export class MongoIndexBootstrapService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureVoteOtpIndexes(): Promise<void> {
    const listed = await this.prisma.$runCommandRaw({
      listIndexes: 'VoteOtp',
      cursor: {}
    })
    const allIndexes = cursorBatch(listed).filter(
      (value): value is MongoIndexDescription => typeof value === 'object' && value !== null
    )
    const expiresAtIndexes = allIndexes.filter(isExpiresAtIndex)
    for (const index of expiresAtIndexes) {
      if (index.expireAfterSeconds === 0 || !index.name) continue
      await this.prisma.$runCommandRaw({
        dropIndexes: 'VoteOtp',
        index: index.name
      })
    }

    const duplicateResult = await this.prisma.$runCommandRaw({
      aggregate: 'VoteOtp',
      pipeline: [
        {
          $group: {
            _id: {
              identityHash: '$identityHash',
              authMethod: '$authMethod'
            },
            count: { $sum: 1 }
          }
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 1 }
      ],
      cursor: {}
    })
    if (cursorBatch(duplicateResult).length > 0) {
      throw new Error('Mongo index preflight failed: duplicate VoteOtp identity/authMethod records exist')
    }

    const hasTtlIndex = expiresAtIndexes.some((index) => index.expireAfterSeconds === 0)
    const hasIdentityUniqueIndex = allIndexes.some(
      (index) =>
        index.key?.identityHash === 1 &&
        index.key?.authMethod === 1 &&
        Object.keys(index.key).length === 2 &&
        index.unique === true
    )
    const requiredIndexes: Prisma.InputJsonObject[] = []
    if (!hasTtlIndex) {
      requiredIndexes.push({
        key: { expiresAt: 1 },
        name: 'vote_otp_expires_ttl',
        expireAfterSeconds: 0
      })
    }
    if (!hasIdentityUniqueIndex) {
      requiredIndexes.push({
        key: { identityHash: 1, authMethod: 1 },
        name: 'vote_otp_identity_auth_unique',
        unique: true
      })
    }
    if (requiredIndexes.length > 0) {
      await this.prisma.$runCommandRaw({
        createIndexes: 'VoteOtp',
        indexes: requiredIndexes
      })
    }
  }

  async ensureTransferIndexes(): Promise<void> {
    const invalidCoreFields = await this.prisma.$runCommandRaw({
      aggregate: 'TransferContract',
      pipeline: [
        {
          $match: {
            $expr: {
              $or: [
                { $ne: [{ $type: '$transferRequestId' }, 'objectId'] },
                { $ne: [{ $type: '$seriesId' }, 'objectId'] },
                { $ne: [{ $type: '$fromMangakaId' }, 'objectId'] },
                { $ne: [{ $type: '$toMangakaId' }, 'objectId'] },
                { $eq: [{ $type: '$transferType' }, 'missing'] }
              ]
            }
          }
        },
        { $limit: 1 }
      ],
      cursor: {}
    })
    if (cursorBatch(invalidCoreFields).length > 0) {
      throw new Error('Mongo index preflight failed: TransferContract core fields require backfill')
    }

    for (const collection of ['TransferContract', 'Contract']) {
      const field = collection === 'TransferContract' ? 'transferRequestId' : 'sourceTransferRequestId'
      const duplicates = await this.prisma.$runCommandRaw({
        aggregate: collection,
        pipeline: [
          { $match: { [field]: { $type: 'objectId' } } },
          { $group: { _id: `$${field}`, count: { $sum: 1 } } },
          { $match: { count: { $gt: 1 } } },
          { $limit: 1 }
        ],
        cursor: {}
      })
      if (cursorBatch(duplicates).length > 0) {
        throw new Error(`Mongo index preflight failed: duplicate ${collection}.${field} records exist`)
      }

      const legacyIndex =
        collection === 'TransferContract'
          ? 'TransferContract_transferRequestId_idx'
          : 'Contract_sourceTransferRequestId_idx'
      try {
        await this.prisma.$runCommandRaw({ dropIndexes: collection, index: legacyIndex })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!/index not found|IndexNotFound/i.test(message)) throw error
      }
      await this.prisma.$runCommandRaw({
        createIndexes: collection,
        indexes: [
          {
            key: { [field]: 1 },
            name: `${collection === 'TransferContract' ? 'transfer_contract_request' : 'contract_source_transfer'}_unique`,
            unique: true,
            partialFilterExpression: { [field]: { $type: 'objectId' } }
          }
        ]
      })
    }
  }
}
