import { config } from 'dotenv'
import fs from 'fs'
import path from 'path'
import { Environment, parseEnvironment } from './env-schema'

config()

if (process.env.NODE_ENV !== 'production' && !fs.existsSync(path.resolve('.env'))) {
  process.stderr.write('.env file not found\n')
  process.exit(1)
}

let envConfig: Environment
try {
  envConfig = parseEnvironment(process.env)
} catch (error) {
  const message = error instanceof Error ? error.message : 'Invalid environment configuration'
  process.stderr.write(`${message}\n`)
  process.exit(1)
  throw error
}

export default envConfig
