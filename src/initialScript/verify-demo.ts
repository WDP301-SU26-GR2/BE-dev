import 'dotenv/config'
import { Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { verifyDemoMediaObjects } from './demo/demo-db'
import { verifyDemoData } from './demo/demo-verify'

const logger = new Logger('DemoVerifyCli')

const main = async () => {
  const prisma = new PrismaClient()
  try {
    await prisma.$connect()
    const result = await verifyDemoData(prisma)
    if (!process.argv.includes('--skip-media-check')) {
      const missing = await verifyDemoMediaObjects()
      if (missing.length) result.failures.push(`Missing R2 media objects: ${missing.join(', ')}`)
    }
    logger.log(JSON.stringify(result.checks, null, 2))
    if (result.failures.length) throw new Error(result.failures.join('\n'))
    logger.log('All demo seed invariants passed')
  } finally {
    await prisma.$disconnect()
  }
}

void main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
