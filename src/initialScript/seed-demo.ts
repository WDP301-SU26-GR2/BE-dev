import 'dotenv/config'
import { Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import {
  createDemoAccounts,
  ensureBaseRoles,
  findDemoAccounts,
  resetDemoData,
  seedDemoMedia,
  verifyDemoMediaObjects
} from './demo/demo-db'
import { seedDemoBusinessData } from './demo/demo-seed.service'
import { verifyDemoData } from './demo/demo-verify'

const logger = new Logger('DemoSeedCli')

const main = async () => {
  const prisma = new PrismaClient()
  const args = new Set(process.argv.slice(2))
  const reset = args.has('--reset')
  const skipMediaUpload = args.has('--skip-media-upload')
  const skipMediaCheck = args.has('--skip-media-check') || skipMediaUpload

  if (process.env.NODE_ENV === 'production' && process.env.DEMO_SEED_ALLOW_PRODUCTION !== 'YES') {
    throw new Error('Production seed is locked. Set DEMO_SEED_ALLOW_PRODUCTION=YES after backup and approval.')
  }

  try {
    await prisma.$connect()
    const existing = await findDemoAccounts(prisma)
    if (existing.length) {
      if (!reset)
        throw new Error(`Found ${existing.length} demo accounts. Re-run with --reset for a clean demo dataset.`)
      if (process.env.DEMO_SEED_ALLOW_RESET !== 'YES') {
        throw new Error('Demo reset is locked. Set DEMO_SEED_ALLOW_RESET=YES to delete demo-owned records only.')
      }
      await resetDemoData(prisma)
    }

    await ensureBaseRoles(prisma)
    const accounts = await createDemoAccounts(prisma)
    const uploader = accounts.get('editor.naomi')
    if (!uploader) throw new Error('Missing editor.naomi after account seed')
    const media = await seedDemoMedia(prisma, uploader.id, !skipMediaUpload)
    const summary = await seedDemoBusinessData(prisma, accounts, media)
    const verification = await verifyDemoData(prisma)
    if (!skipMediaCheck) {
      const missing = await verifyDemoMediaObjects()
      if (missing.length) verification.failures.push(`Missing R2 media objects: ${missing.join(', ')}`)
    }
    if (verification.failures.length) {
      throw new Error(`Demo verification failed:\n- ${verification.failures.join('\n- ')}`)
    }
    logger.log(`Seed complete: ${JSON.stringify(summary)}`)
    logger.log(`Verification complete: ${JSON.stringify(verification.checks)}`)
  } finally {
    await prisma.$disconnect()
  }
}

void main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
