import { buildSuiteDatabaseUrl, validateTestEnvironment } from './environment-guard'

const SAFE_DATABASE_URL = 'mongodb://localhost:27017/mangaka_test?replicaSet=rs0'
const SAFE_REDIS_URL = 'redis://localhost:6379/5'

const validEnvironment = (overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  TEST_DATABASE_URL: SAFE_DATABASE_URL,
  TEST_REDIS_URL: SAFE_REDIS_URL,
  ...overrides
})

describe('test environment guard', () => {
  it('requires NODE_ENV=test', () => {
    expect(() => validateTestEnvironment(validEnvironment({ NODE_ENV: 'development' }))).toThrow(
      'NODE_ENV must be "test"'
    )
  })

  it('requires TEST_DATABASE_URL instead of falling back to DATABASE_URL', () => {
    expect(() =>
      validateTestEnvironment(
        validEnvironment({
          TEST_DATABASE_URL: undefined,
          DATABASE_URL: SAFE_DATABASE_URL
        })
      )
    ).toThrow('TEST_DATABASE_URL is required')
  })

  it.each([
    'mongodb://mongo.production.internal:27017/mangaka_test?replicaSet=rs0',
    'mongodb://localhost:27017/mangaka_production?replicaSet=rs0',
    'mongodb://localhost:27017/mangaka?replicaSet=rs0'
  ])('rejects an unsafe Mongo target before any query: %s', (databaseUrl) => {
    expect(() => validateTestEnvironment(validEnvironment({ TEST_DATABASE_URL: databaseUrl }))).toThrow()
  })

  it('accepts a CI-prefixed database and returns only a sanitized target for logging', () => {
    const result = validateTestEnvironment(
      validEnvironment({
        TEST_DATABASE_URL: 'mongodb://secret-user:secret-password@localhost:27017/ci_918273_mangaka?replicaSet=rs0'
      })
    )

    expect(result.databaseName).toBe('ci_918273_mangaka')
    expect(result.sanitizedDatabaseTarget).toBe('mongodb://localhost:27017/ci_918273_mangaka')
    expect(result.sanitizedDatabaseTarget).not.toContain('secret-user')
    expect(result.sanitizedDatabaseTarget).not.toContain('secret-password')
  })

  it('rejects Redis DB 0 so tests cannot share the default application namespace', () => {
    expect(() => validateTestEnvironment(validEnvironment({ TEST_REDIS_URL: 'redis://localhost:6379/0' }))).toThrow(
      'non-zero Redis database'
    )
  })

  it('accepts a dedicated Mongo database and Redis database', () => {
    expect(validateTestEnvironment(validEnvironment())).toMatchObject({
      databaseUrl: SAFE_DATABASE_URL,
      databaseName: 'mangaka_test',
      redisUrl: SAFE_REDIS_URL,
      redisDatabase: 5,
      sanitizedDatabaseTarget: 'mongodb://localhost:27017/mangaka_test',
      sanitizedRedisTarget: 'redis://localhost:6379/5'
    })
  })

  it('derives a deterministic, test-suffixed database for a suite namespace', () => {
    expect(buildSuiteDatabaseUrl(SAFE_DATABASE_URL, 'worker 02/payment')).toBe(
      'mongodb://localhost:27017/mangaka_worker_02_payment_test?replicaSet=rs0'
    )
  })
})
