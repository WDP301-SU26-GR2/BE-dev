import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'
import { MongoClient } from 'mongodb'
import envConfig from 'src/core/config/envConfig'
import {
  AuditRolloutService,
  type IndexInspectionClient,
  ROLLOUT_APPROVAL,
  type RolloutRedis
} from 'src/infrastructure/database/audit-rollout.service'
import { GuestVoteRolloutService } from 'src/infrastructure/database/guest-vote-rollout.service'
import { RolloutIndexVerificationService } from 'src/infrastructure/database/rollout-index-verification.service'
import { TransferRolloutService } from 'src/infrastructure/database/transfer-rollout.service'

type Command = 'preflight' | 'verify-indexes' | 'remediate-guest-vote' | 'remediate-transfer' | 'verify-privacy'

const args = process.argv.slice(2)
const commandValue = args.find((arg) => !arg.startsWith('--')) ?? 'preflight'
const command = commandValue as Command
const apply = args.includes('--apply')
const approval = args.find((arg) => arg.startsWith('--approval='))?.slice('--approval='.length)
const transferIds =
  args
    .find((arg) => arg.startsWith('--ids='))
    ?.slice('--ids='.length)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean) ?? []

const sanitizedTarget = (raw: string) => {
  const url = new URL(raw)
  return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`
}

const main = async () => {
  if (apply && approval !== ROLLOUT_APPROVAL) {
    throw new Error(`Apply refused: pass --approval=${ROLLOUT_APPROVAL}`)
  }
  const prisma = new PrismaClient()
  let mongoClient: MongoClient | undefined
  const indexInspection: IndexInspectionClient = {
    async listIndexes(collection) {
      if (!mongoClient) {
        mongoClient = new MongoClient(envConfig.DATABASE_URL)
        await mongoClient.connect()
      }
      const indexes = await mongoClient.db().collection(collection).listIndexes().toArray()
      return indexes.map((index) => {
        const rawKey: unknown = index.key
        const key =
          typeof rawKey === 'object' && rawKey !== null
            ? Object.fromEntries(
                Object.entries(rawKey as Record<string, unknown>).map(([field, direction]) => [
                  field,
                  Number(direction)
                ])
              )
            : {}
        return {
          name: index.name,
          key,
          unique: index.unique,
          expireAfterSeconds: index.expireAfterSeconds,
          partialFilterExpression: index.partialFilterExpression
        }
      })
    }
  }
  const service = new AuditRolloutService(
    new TransferRolloutService(prisma),
    new GuestVoteRolloutService(prisma),
    new RolloutIndexVerificationService(indexInspection)
  )
  let redis: Redis | undefined
  try {
    if (command === 'preflight') {
      console.info(`[audit-rollout] read-only target=${sanitizedTarget(envConfig.DATABASE_URL)}`)
      console.info(JSON.stringify(await service.preflight(), null, 2))
      return
    }
    if (command === 'verify-indexes') {
      console.info(`[audit-rollout] read-only target=${sanitizedTarget(envConfig.DATABASE_URL)}`)
      const result = await service.verify('indexes')
      console.info(JSON.stringify(result, null, 2))
      if (!result.ok) process.exitCode = 2
      return
    }
    if (command === 'remediate-transfer') {
      console.info(
        `[audit-rollout] mode=${apply ? 'APPLY' : 'DRY_RUN'} target=${sanitizedTarget(envConfig.DATABASE_URL)}`
      )
      console.info(
        JSON.stringify(await service.remediateAcceptedTransfers({ ids: transferIds, apply, approval }), null, 2)
      )
      return
    }
    redis = new Redis(envConfig.REDIS_URL, { enableOfflineQueue: false, maxRetriesPerRequest: 1 })
    if (command === 'remediate-guest-vote') {
      console.info(
        `[audit-rollout] mode=${apply ? 'APPLY' : 'DRY_RUN'} target=${sanitizedTarget(envConfig.DATABASE_URL)}`
      )
      console.info(
        JSON.stringify(
          await service.remediateGuestVote({ apply, approval, redis: redis as unknown as RolloutRedis }),
          null,
          2
        )
      )
      return
    }
    if (command === 'verify-privacy') {
      console.info(`[audit-rollout] read-only target=${sanitizedTarget(envConfig.DATABASE_URL)}`)
      const result = await service.verify('privacy', redis as unknown as RolloutRedis)
      console.info(JSON.stringify(result, null, 2))
      if (!result.ok) process.exitCode = 2
      return
    }
    throw new Error(`Unknown audit rollout command: ${commandValue}`)
  } finally {
    redis?.disconnect()
    await mongoClient?.close()
    await prisma.$disconnect()
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Audit rollout failed'
  process.stderr.write(`[audit-rollout] ${message}\n`)
  process.exitCode = 1
})
