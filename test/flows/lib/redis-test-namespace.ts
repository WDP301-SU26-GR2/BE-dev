import type { Redis } from 'ioredis'

const safeSegment = (value: string) => {
  const segment = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
  if (!segment) throw new Error('[test-env] Redis namespace segments must contain an alphanumeric character')
  return segment
}

export const createRedisTestPrefix = (suiteId: string, runId: string) =>
  `test:${safeSegment(suiteId)}:${safeSegment(runId)}`

export const clearRedisTestNamespace = async (redis: Redis, prefix: string) => {
  if (!prefix.startsWith('test:')) {
    throw new Error('[test-env] refusing to clean a Redis prefix outside the test namespace')
  }

  let cursor = '0'
  let deleted = 0
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 100)
    cursor = nextCursor
    if (keys.length > 0) {
      deleted += await redis.del(...keys)
    }
  } while (cursor !== '0')
  return deleted
}
