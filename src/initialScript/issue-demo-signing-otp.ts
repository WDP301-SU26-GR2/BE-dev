import 'dotenv/config'
import { randomInt } from 'crypto'
import { Logger } from '@nestjs/common'
import { OtpPurpose, PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { DEMO_ACCOUNTS } from './demo/demo-data'

const logger = new Logger('DemoSigningOtpCli')
const OTP_TTL_MS = 5 * 60_000

const main = async () => {
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_SEED_ALLOW_PRODUCTION !== 'YES') {
    throw new Error('Production demo OTP is locked. Set DEMO_SEED_ALLOW_PRODUCTION=YES for the approved demo window.')
  }
  const alias = process.argv.slice(2).find((arg) => !arg.startsWith('-'))
  const account = DEMO_ACCOUNTS.find((item) => item.alias === alias)
  if (!account)
    throw new Error(`Unknown demo alias. Allowed aliases: ${DEMO_ACCOUNTS.map((item) => item.alias).join(', ')}`)
  if (account.role !== 'MANGAKA' && account.role !== 'BOARD_MEMBER') {
    throw new Error('Signing OTP is only valid for demo Mangaka or Board Member accounts.')
  }

  const prisma = new PrismaClient()
  try {
    await prisma.$connect()
    const user = await prisma.user.findUnique({ where: { email: account.email }, select: { id: true } })
    if (!user) throw new Error(`Demo account ${account.alias} has not been seeded.`)
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const otpCodeHash = await bcrypt.hash(code, Number(process.env.SALT_OR_ROUNDS ?? 10))
    const expiresAt = new Date(Date.now() + OTP_TTL_MS)
    await prisma.otpRequest.upsert({
      where: { email_purpose: { email: account.email, purpose: OtpPurpose.SIGNING_CONTRACT } },
      update: { otpCodeHash, ip: 'demo-operator-cli', expiresAt, attempts: 0, isUsed: false },
      create: {
        email: account.email,
        otpCodeHash,
        ip: 'demo-operator-cli',
        purpose: OtpPurpose.SIGNING_CONTRACT,
        expiresAt,
        attempts: 0,
        isUsed: false
      }
    })
    logger.warn(`One-time signing OTP for ${account.alias}: ${code} (expires ${expiresAt.toISOString()})`)
  } finally {
    await prisma.$disconnect()
  }
}

void main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
