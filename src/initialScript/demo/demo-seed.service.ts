import { Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { SeededAccount, SeededMedia } from './demo-db'
import { seedLifecycleBoard } from './fixtures/board.fixture'
import { seedConfigs, seedProfiles } from './fixtures/config-profile.fixture'
import { seedPortfolioMetadata, seedNotifications } from './fixtures/portfolio-notification.fixture'
import { seedProductionHero } from './fixtures/production-flow.fixture'
import { seedRankingsAndVoting } from './fixtures/ranking-voting.fixture'
import { seedContractRuns, seedFlowOne, seedRankingRoster } from './fixtures/series-flow.fixture'
import { buildSummary } from './fixtures/summary.fixture'
import { DemoContext, DemoSeedSummary } from './fixtures/demo-seed.types'

const logger = new Logger('DemoSeed')

export type { DemoSeedSummary } from './fixtures/demo-seed.types'

export const seedDemoBusinessData = async (
  prisma: PrismaClient,
  accounts: Map<string, SeededAccount>,
  media: Map<string, SeededMedia>
): Promise<DemoSeedSummary> => {
  const context: DemoContext = { prisma, accounts, media, now: new Date() }
  logger.log('Phase 1/8: configuration and user profiles')
  await seedConfigs(context)
  await seedProfiles(context)

  logger.log('Phase 2/8: Flow 1 proposal and Name datasets')
  const flowOneSeries = await seedFlowOne(context)
  logger.log('Phase 3/8: Flow 2-3 chapter, production stage, task and AI datasets')
  const hero = await seedProductionHero(context)
  logger.log('Phase 4/8: Flow 6 contract negotiation datasets')
  const contractSeries = await seedContractRuns(context)
  logger.log('Phase 5/8: Flow 4 ranking roster and published history')
  const rankingRoster = await seedRankingRoster(context)
  const rankingSeries = [hero, ...rankingRoster]

  logger.log('Phase 6/8: Flow 4 surveys, online/offline votes and ranking history')
  await seedRankingsAndVoting(context, rankingSeries)
  logger.log('Phase 7/8: Flow 5 lifecycle Board session, decisions and reports')
  await seedLifecycleBoard(context, rankingRoster)
  logger.log('Phase 8/8: portfolio metadata and notifications')
  await seedPortfolioMetadata(context, hero, contractSeries)
  await seedNotifications(context, flowOneSeries, hero)

  const summary = await buildSummary(context)
  logger.log(`Demo business data created: ${JSON.stringify(summary)}`)
  return summary
}
