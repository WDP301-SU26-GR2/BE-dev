import * as fs from 'node:fs'
import * as path from 'node:path'
import { validateTestEnvironment } from './environment-guard.js'

// Tự load `.env.flowtest` (không dựa --env-file để flowtest:one cũng chạy được trần).
// Format hỗ trợ: KEY=value, KEY="value", KEY='value', KEY="value" (kể cả giá trị có '#').
// 🔴 FORCE OVERRIDE TOÀN BỘ key từ .env.flowtest. Lý do:
// `@prisma/client` tự load TOÀN BỘ `.env` (env DEV!) vào process.env ngay khi module được
// import — ESM hoisting khiến entry file (import '@prisma/client' trước './lib/env.js')
// bị nhiễm DATABASE_URL + REDIS_URL dev TRƯỚC khi file này chạy. Hậu quả đã dính thật:
// REDIS_URL db0 lọt vào cron-context → enqueue notification vào QUEUE CỦA DEV SERVER →
// dev server (nối Mongo DEV) tranh job → notification "biến mất" khỏi DB flowtest ngẫu nhiên.
// Flowtest là môi trường hermetic: .env.flowtest là nguồn sự thật duy nhất cho MỌI biến.
const explicitSafetyEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  TEST_REDIS_URL: process.env.TEST_REDIS_URL,
  PRODUCTION_DATABASE_HOSTS: process.env.PRODUCTION_DATABASE_HOSTS
}

const envPath = path.resolve(process.cwd(), '.env.flowtest')
if (fs.existsSync(envPath)) {
  for (const rawLine of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const line = rawLine.replace(/^\uFEFF/, '').trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const key = m[1]
    let value = m[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

// Safety controls supplied by CI/caller always win over the convenience file.
// This prevents `.env.flowtest` from downgrading NODE_ENV or replacing the isolated targets.
for (const [key, value] of Object.entries(explicitSafetyEnvironment)) {
  if (value != null) process.env[key] = value
}

// Guard runs before PrismaClient is constructed in seed.ts. It never logs credentials.
const testEnvironment = validateTestEnvironment(process.env)
process.env.DATABASE_URL = testEnvironment.databaseUrl
process.env.REDIS_URL = testEnvironment.redisUrl

export const DATABASE_URL = testEnvironment.databaseUrl
export const API = `http://localhost:${process.env.PORT ?? '4100'}`
export const TEST_DATABASE_NAME = testEnvironment.databaseName
export const TEST_REDIS_DATABASE = testEnvironment.redisDatabase

console.info(
  `[flowtest] isolated targets: Mongo=${testEnvironment.sanitizedDatabaseTarget}, Redis=${testEnvironment.sanitizedRedisTarget}`
)
