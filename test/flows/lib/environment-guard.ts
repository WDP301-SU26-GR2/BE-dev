const MONGO_PROTOCOLS = new Set(['mongodb:', 'mongodb+srv:'])
const REDIS_PROTOCOLS = new Set(['redis:', 'rediss:'])
const PRODUCTION_MARKER = /(^|[._-])(prod|production)([._-]|$)/i
const TEST_DATABASE_NAME = /(?:_test$)|(?:^ci[_-][a-z0-9_-]+$)/i

export type ValidatedTestEnvironment = {
  databaseUrl: string
  databaseName: string
  redisUrl: string
  redisDatabase: number
  sanitizedDatabaseTarget: string
  sanitizedRedisTarget: string
}

const parseUrl = (rawUrl: string, variableName: string): URL => {
  try {
    return new URL(rawUrl)
  } catch {
    throw new Error(`[test-env] ${variableName} must be a valid URL`)
  }
}

const sanitizeTarget = (url: URL, databaseName?: string) => {
  const port = url.port ? `:${url.port}` : ''
  const pathname = databaseName == null ? url.pathname : `/${databaseName}`
  return `${url.protocol}//${url.hostname}${port}${pathname}`
}

const databaseNameFrom = (url: URL) => decodeURIComponent(url.pathname.replace(/^\/+/, '').split('/')[0] ?? '')

export const buildSuiteDatabaseUrl = (databaseUrl: string, suiteId: string) => {
  const mongo = parseUrl(databaseUrl, 'TEST_DATABASE_URL')
  const baseName = databaseNameFrom(mongo)
  const namespace = suiteId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
  if (!namespace) throw new Error('[test-env] TEST_SUITE_ID must contain an alphanumeric character')

  const stem = baseName.replace(/_test$/i, '')
  mongo.pathname = `/${stem}_${namespace}_test`
  return mongo.toString()
}

const productionHostsFrom = (env: NodeJS.ProcessEnv) =>
  new Set(
    (env.PRODUCTION_DATABASE_HOSTS ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean)
  )

export const validateTestEnvironment = (env: NodeJS.ProcessEnv): ValidatedTestEnvironment => {
  if (env.NODE_ENV !== 'test') {
    throw new Error('[test-env] NODE_ENV must be "test"')
  }

  const baseDatabaseUrl = env.TEST_DATABASE_URL?.trim()
  if (!baseDatabaseUrl) {
    throw new Error('[test-env] TEST_DATABASE_URL is required; DATABASE_URL fallback is forbidden')
  }

  const mongo = parseUrl(baseDatabaseUrl, 'TEST_DATABASE_URL')
  if (!MONGO_PROTOCOLS.has(mongo.protocol)) {
    throw new Error('[test-env] TEST_DATABASE_URL must use mongodb:// or mongodb+srv://')
  }

  const databaseName = databaseNameFrom(mongo)
  const hostname = mongo.hostname.toLowerCase()
  if (
    !databaseName ||
    PRODUCTION_MARKER.test(hostname) ||
    PRODUCTION_MARKER.test(databaseName) ||
    productionHostsFrom(env).has(hostname)
  ) {
    throw new Error('[test-env] TEST_DATABASE_URL points to a production or unnamed Mongo target')
  }
  if (!TEST_DATABASE_NAME.test(databaseName)) {
    throw new Error('[test-env] Mongo database must end in "_test" or use a "ci_" / "ci-" prefix')
  }

  const databaseUrl = env.TEST_SUITE_ID ? buildSuiteDatabaseUrl(baseDatabaseUrl, env.TEST_SUITE_ID) : baseDatabaseUrl
  const suiteMongo = parseUrl(databaseUrl, 'TEST_DATABASE_URL')
  const suiteDatabaseName = databaseNameFrom(suiteMongo)

  const redisUrl = (env.TEST_REDIS_URL ?? env.REDIS_URL)?.trim()
  if (!redisUrl) {
    throw new Error('[test-env] TEST_REDIS_URL (or an isolated REDIS_URL) is required')
  }

  const redis = parseUrl(redisUrl, env.TEST_REDIS_URL ? 'TEST_REDIS_URL' : 'REDIS_URL')
  if (!REDIS_PROTOCOLS.has(redis.protocol)) {
    throw new Error('[test-env] test Redis URL must use redis:// or rediss://')
  }
  const redisPath = redis.pathname.replace(/^\/+/, '')
  const redisDatabase = redisPath === '' ? 0 : Number(redisPath)
  if (!Number.isInteger(redisDatabase) || redisDatabase <= 0) {
    throw new Error('[test-env] tests require a non-zero Redis database')
  }

  return {
    databaseUrl,
    databaseName: suiteDatabaseName,
    redisUrl,
    redisDatabase,
    sanitizedDatabaseTarget: sanitizeTarget(suiteMongo, suiteDatabaseName),
    sanitizedRedisTarget: sanitizeTarget(redis)
  }
}
