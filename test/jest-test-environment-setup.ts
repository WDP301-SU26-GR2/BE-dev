import { validateTestEnvironment } from './flows/lib/environment-guard'
import setUtcTimezone from './jest-global-setup'

export default function testEnvironmentSetup() {
  setUtcTimezone()
  const validated = validateTestEnvironment(process.env)
  process.env.DATABASE_URL = validated.databaseUrl
  process.env.REDIS_URL = validated.redisUrl
  console.info(
    `[test-env] isolated targets: Mongo=${validated.sanitizedDatabaseTarget}, Redis=${validated.sanitizedRedisTarget}`
  )
}
