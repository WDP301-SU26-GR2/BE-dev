import { PublicationType, ReaderAuthMethod, RiskLevel, SurveyStatus } from '@prisma/client'
import { DEMO_HISTORY_DAYS, DEMO_ITERATIONS } from '../demo-data'
import { DAY, hash, requiredAccount } from './demo-seed.helpers'
import { DemoContext, SeriesSeed } from './demo-seed.types'

export const seedRankingsAndVoting = async (context: DemoContext, series: SeriesSeed[]) => {
  const creator = requiredAccount(context.accounts, 'editor.duc')
  const atRiskIds = new Set(series.slice(-3).map((row) => row.id))
  let previous = new Map<string, number>()

  for (let periodIndex = 0; periodIndex < DEMO_HISTORY_DAYS; periodIndex += 1) {
    const period = await context.prisma.surveyPeriod.create({
      data: {
        createdBy: creator.id,
        magazine: 'Manga Nexus Weekly',
        publicationType: PublicationType.WEEKLY,
        eligibleSeriesIds: series.map((row) => row.id),
        issueNumber: 200 + periodIndex,
        reflectedIssueNumber: 192 + periodIndex,
        startDate: new Date(context.now.getTime() - (DEMO_HISTORY_DAYS - periodIndex + 1) * DAY),
        endDate: new Date(context.now.getTime() - (DEMO_HISTORY_DAYS - periodIndex) * DAY),
        status: SurveyStatus.REFLECTED
      }
    })
    const healthy = series.filter((row) => !atRiskIds.has(row.id))
    const risky = series.filter((row) => atRiskIds.has(row.id))
    const ordered = [
      ...healthy.slice(periodIndex % healthy.length),
      ...healthy.slice(0, periodIndex % healthy.length),
      ...risky
    ]
    const current = new Map<string, number>()
    await context.prisma.rankingRecord.createMany({
      data: ordered.map((row, index) => {
        const rank = index + 1
        current.set(row.id, rank)
        const old = previous.get(row.id)
        const consecutive = atRiskIds.has(row.id) ? periodIndex + 1 : 0
        return {
          surveyPeriodId: period.id,
          seriesId: row.id,
          rankPosition: rank,
          voteCount: 2450 - index * 165 + periodIndex * 12,
          normalizedScore: Number(((2450 - index * 165 + periodIndex * 12) / 2450).toFixed(4)),
          previousRank: old ?? null,
          rankChange: old ? old - rank : null,
          isAtRisk: atRiskIds.has(row.id),
          riskLevel: !atRiskIds.has(row.id)
            ? RiskLevel.NONE
            : consecutive >= 5
              ? RiskLevel.SEVERE
              : consecutive >= 3
                ? RiskLevel.MEDIUM
                : RiskLevel.LOW,
          consecutiveAtRiskCount: consecutive,
          isReliable: true,
          recordedAt: new Date(context.now.getTime() - (DEMO_HISTORY_DAYS - periodIndex) * DAY)
        }
      })
    })
    previous = current
  }

  for (let index = 0; index < DEMO_ITERATIONS; index += 1) {
    const period = await context.prisma.surveyPeriod.create({
      data: {
        createdBy: creator.id,
        magazine: 'Manga Nexus Weekly',
        publicationType: PublicationType.WEEKLY,
        eligibleSeriesIds: series.map((row) => row.id),
        issueNumber: 300 + index,
        reflectedIssueNumber: 292 + index,
        startDate: new Date(context.now.getTime() - (index + 2) * DAY),
        endDate: new Date(context.now.getTime() - (index + 1) * DAY),
        status: SurveyStatus.CLOSED
      }
    })
    await context.prisma.surveyData.create({
      data: {
        surveyPeriodId: period.id,
        importedBy: creator.id,
        surveyDate: new Date(context.now.getTime() - DAY),
        entries: series.map((row, seriesIndex) => ({ seriesId: row.id, voteCount: 80 + index * 7 + seriesIndex * 11 }))
      }
    })
    for (let voteIndex = 0; voteIndex < 5; voteIndex += 1) {
      await context.prisma.readerVote.create({
        data: {
          surveyPeriodId: period.id,
          seriesIds: [
            series[(voteIndex + index) % series.length].id,
            series[(voteIndex + index + 1) % series.length].id
          ],
          identityHash: hash(`demo-voter-${index}-${voteIndex}`),
          publicationType: PublicationType.WEEKLY,
          authMethod: ReaderAuthMethod.EMAIL_OTP,
          ipHash: hash(`203.0.113.${20 + voteIndex}`),
          captchaScore: voteIndex === 4 ? 0.55 : 0.91,
          voteWeight: voteIndex === 4 ? 0.5 : 1,
          isFlagged: voteIndex === 4
        }
      })
    }
  }

  await context.prisma.surveyPeriod.create({
    data: {
      createdBy: creator.id,
      magazine: 'Manga Nexus Weekly',
      publicationType: PublicationType.WEEKLY,
      eligibleSeriesIds: series.map((row) => row.id),
      issueNumber: 400,
      reflectedIssueNumber: 400,
      startDate: new Date(context.now.getTime() - DAY),
      endDate: new Date(context.now.getTime() + 6 * DAY),
      status: SurveyStatus.OPEN
    }
  })
}
