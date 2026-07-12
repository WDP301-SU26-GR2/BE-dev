import * as fs from 'node:fs'
import * as path from 'node:path'

// Tự load `.env.flowtest` (không dựa --env-file để flowtest:one cũng chạy được trần).
// Format hỗ trợ: KEY=value, KEY="value", KEY='value', KEY="value" (kể cả giá trị có '#').
// 🔴 FORCE OVERRIDE TOÀN BỘ key từ .env.flowtest. Lý do:
// `@prisma/client` tự load TOÀN BỘ `.env` (env DEV!) vào process.env ngay khi module được
// import — ESM hoisting khiến entry file (import '@prisma/client' trước './lib/env.js')
// bị nhiễm DATABASE_URL + REDIS_URL dev TRƯỚC khi file này chạy. Hậu quả đã dính thật:
// REDIS_URL db0 lọt vào cron-context → enqueue notification vào QUEUE CỦA DEV SERVER →
// dev server (nối Mongo DEV) tranh job → notification "biến mất" khỏi DB flowtest ngẫu nhiên.
// Flowtest là môi trường hermetic: .env.flowtest là nguồn sự thật duy nhất cho MỌI biến.
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

export const DATABASE_URL = process.env.DATABASE_URL ?? ''
export const API = `http://localhost:${process.env.PORT ?? '4100'}`

// 🔴 GUARD SỐNG CÒN: chống wipe nhầm DB dev/prod.
// lib/seed.ts (wipeDb) chạy deleteMany trên MỌI collection — nếu trỏ nhầm DB là mất sạch.
if (!DATABASE_URL.includes('flowtest')) {
  console.error(`[flowtest] DATABASE_URL không chứa 'flowtest' — DỪNG để bảo vệ DB. Got: ${DATABASE_URL || '(empty)'}`)
  process.exit(2)
}

// Tránh BE load .env default (ghi đè DATABASE_URL và các vars khác)
// khi nest AppModule khởi chạy.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'flowtest'
