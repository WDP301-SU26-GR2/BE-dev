import { Redis } from 'ioredis'
import { validateTestEnvironment } from '../flows/lib/environment-guard'
import { clearRedisTestNamespace, createRedisTestPrefix } from '../flows/lib/redis-test-namespace'

const validated = validateTestEnvironment(process.env)

describe('Redis test namespace isolation', () => {
  const redis = new Redis(validated.redisUrl, {
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1
  })

  beforeAll(async () => {
    await redis.connect()
  })

  afterAll(() => {
    redis.disconnect()
  })

  it('uses a dedicated Redis DB and cleans only the current suite prefix', async () => {
    await expect(redis.ping()).resolves.toBe('PONG')

    const runId = `${process.pid}-${Date.now()}`
    const prefix = createRedisTestPrefix('integration', runId)
    const neighborPrefix = createRedisTestPrefix('integration-neighbor', runId)
    const ownedKey = `${prefix}:owned`
    const neighborKey = `${neighborPrefix}:keep`

    await redis.mset(ownedKey, 'owned', neighborKey, 'neighbor')
    try {
      expect(await clearRedisTestNamespace(redis, prefix)).toBe(1)
      await expect(redis.get(ownedKey)).resolves.toBeNull()
      await expect(redis.get(neighborKey)).resolves.toBe('neighbor')
    } finally {
      await redis.del(ownedKey, neighborKey)
    }
  })
})
