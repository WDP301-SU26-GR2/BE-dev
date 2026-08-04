import * as bcrypt from 'bcrypt'
import { OtpPurpose, PrismaClient } from '@prisma/client'
import { createHmac } from 'node:crypto'
import { prisma, PW } from './seed.js'
import { req, type Res } from './http.js'

const tokenCache = new Map<string, string>()

// Pattern smoke-fix2: upsert OtpRequest với bcrypt('123456').
export const seedOtp = (email: string, purpose: OtpPurpose) => {
  if (purpose === OtpPurpose.VOTE) {
    const hmac = (value: string) =>
      createHmac('sha256', process.env.IDENTITY_HASH_PEPPER ?? '')
        .update(value)
        .digest('hex')
    const identityHash = hmac(email.trim().toLowerCase())
    return prisma.voteOtp.upsert({
      where: { identityHash_authMethod: { identityHash, authMethod: 'EMAIL_OTP' } },
      update: {
        otpCodeHash: bcrypt.hashSync('123456', 10),
        ipHash: hmac('flowtest-seeded-ip'),
        expiresAt: new Date(Date.now() + 300_000),
        attempts: 0,
        isUsed: false
      },
      create: {
        identityHash,
        authMethod: 'EMAIL_OTP',
        ipHash: hmac('flowtest-seeded-ip'),
        otpCodeHash: bcrypt.hashSync('123456', 10),
        expiresAt: new Date(Date.now() + 300_000)
      }
    })
  }

  return prisma.otpRequest.upsert({
    where: { email_purpose: { email, purpose } },
    update: {
      otpCodeHash: bcrypt.hashSync('123456', 10),
      expiresAt: new Date(Date.now() + 300_000),
      attempts: 0,
      isUsed: false
    },
    create: {
      email,
      purpose,
      otpCodeHash: bcrypt.hashSync('123456', 10),
      expiresAt: new Date(Date.now() + 300_000)
    }
  })
}

export const login = async (email: string, password: string = PW): Promise<string> => {
  const cached = tokenCache.get(email)
  if (cached) return cached
  const r: Res = await req('POST', '/auth/login', { body: { email, password } })
  if (r.status >= 300) {
    throw new Error(`login(${email}) → ${r.status} ${r.raw.slice(0, 200)}`)
  }
  const token = r.json?.data?.accessToken as string | undefined
  if (!token) {
    throw new Error(`login(${email}) missing accessToken in data: ${r.raw.slice(0, 200)}`)
  }
  tokenCache.set(email, token)
  return token
}

export const clearTokenCache = () => tokenCache.clear()

// BR 2026-08-04: POST /series/:id/submit yêu cầu Mangaka đã build hồ sơ (Error.MangakaProfileRequired).
// Gọi sau login cho mọi Mangaka sẽ submit proposal trong flow.
export const ensureMangakaProfile = async (token: string, penName = 'FT Mangaka'): Promise<void> => {
  const r: Res = await req('PUT', '/me/mangaka-profile', { token, body: { penName } })
  if (r.status >= 300) {
    throw new Error(`ensureMangakaProfile → ${r.status} ${r.raw.slice(0, 200)}`)
  }
}

// Login 5 role chuẩn, trả về map { role → token }. Cần gọi sau khi đã seed user.
// Mỗi user truyền vào đã được ACTIVE + verified, dùng password = PW.
export const tokensForUsers = async (users: { email: string }[]) => {
  const out: Record<string, string> = {}
  for (const u of users) {
    out[u.email] = await login(u.email)
  }
  return out
}

// Re-export prisma cho tiện (cron context cũng dùng).
export { prisma }

// Tiny helper cho các file test cần Reject để assert message.
export const expectError = (r: Res, status: number, code: string, name: string) => {
  const msgs: string[] = []
  if (typeof r.json?.code === 'string') msgs.push(r.json.code as string)
  if (typeof r.json?.message === 'string') msgs.push(r.json.message as string)
  if (Array.isArray(r.json?.errors)) {
    for (const e of r.json.errors) {
      if (e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string') {
        msgs.push((e as { code: string }).code)
      }
      if (e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string') {
        msgs.push((e as { message: string }).message)
      }
    }
  }
  if (r.status !== status || !msgs.includes(code)) {
    throw new Error(`${name} FAILED — expect ${status}+${code} got ${r.status} ${JSON.stringify(msgs)}`)
  }
}

// Hint nhỏ để tránh unused import Prisma warning.
export type PrismaClientType = PrismaClient
