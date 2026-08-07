import 'dotenv/config'
import { Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { DEMO_ACCOUNTS } from './demo/demo-data'
import { verifyDemoMagazineRegistry } from './demo/demo-verify'
import { seedDemoMagazines } from './demo/fixtures/config-profile.fixture'

const logger = new Logger('DemoMagazineSyncCli')

const sanitizedDatabaseTarget = (rawUrl: string | undefined) => {
  try {
    const url = new URL(rawUrl ?? '')
    return `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`
  } catch {
    return 'invalid DATABASE_URL'
  }
}

const main = async () => {
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_SEED_ALLOW_PRODUCTION !== 'YES') {
    throw new Error('Production demo magazine sync is locked. Set DEMO_SEED_ALLOW_PRODUCTION=YES after approval.')
  }

  const prisma = new PrismaClient()
  try {
    logger.log(`Target database: ${sanitizedDatabaseTarget(process.env.DATABASE_URL)}`)
    await prisma.$connect()
    const admin = await prisma.user.findUnique({
      where: { email: DEMO_ACCOUNTS.find((account) => account.alias === 'admin.hikari')!.email },
      select: { id: true }
    })
    if (!admin)
      throw new Error('Demo account admin.hikari has not been seeded; refusing to create a demo magazine catalog.')

    const magazines = await seedDemoMagazines(prisma, admin.id)
    const verification = verifyDemoMagazineRegistry(magazines)
    if (verification.failures.length) throw new Error(verification.failures.join('\n'))
    logger.log(`Demo magazine catalog synchronized: ${JSON.stringify(magazines)}`)
  } finally {
    await prisma.$disconnect()
  }
}

void main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
