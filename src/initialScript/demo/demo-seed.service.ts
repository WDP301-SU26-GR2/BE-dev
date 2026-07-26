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
  await seedConfigs(context)
  await seedProfiles(context)

  const flowOneSeries = await seedFlowOne(context)
  const hero = await seedProductionHero(context)
  const contractSeries = await seedContractRuns(context)
  const rankingRoster = await seedRankingRoster(context)
  const rankingSeries = [hero, ...rankingRoster]

  await seedRankingsAndVoting(context, rankingSeries)
  await seedLifecycleBoard(context, rankingRoster)
  await seedPortfolioMetadata(context, hero, contractSeries)
  await seedNotifications(context, flowOneSeries, hero)

  const summary = await buildSummary(context)
  logger.log(`Demo business data created: ${JSON.stringify(summary)}`)
  return summary
}
