import { z } from 'zod'

export const CreateTankobonSalesBodySchema = z.object({
  seriesId: z.string().describe('Series ObjectId'),
  volumeNumber: z.number().int().positive(),
  unitsSold: z.number().int().nonnegative(),
  period: z.string().min(1).describe('Free-text period label, e.g. "2026-Q2"')
})
export type CreateTankobonSalesBodyType = z.infer<typeof CreateTankobonSalesBodySchema>

export const TankobonSalesResSchema = z.object({
  id: z.string(),
  seriesId: z.string(),
  volumeNumber: z.number().int(),
  unitsSold: z.number().int(),
  period: z.string(),
  recordedBy: z.string(),
  createdAt: z.string().describe('ISO 8601 UTC')
})

export const DefenseDashboardResSchema = z.object({
  seriesId: z.string(),
  rankingTrend: z.array(
    z.object({
      surveyPeriodId: z.string(),
      rankPosition: z.number().int().nullable(),
      voteCount: z.number(),
      previousRank: z.number().int().nullable(),
      rankChange: z.number().int().nullable(),
      isAtRisk: z.boolean(),
      riskLevel: z.string(),
      recordedAt: z.string()
    })
  ),
  tankobon: z.object({
    totalUnitsSold: z.number().int(),
    volumes: z.array(z.object({ volumeNumber: z.number().int(), unitsSold: z.number().int(), period: z.string() }))
  }),
  seriesReports: z.array(
    z.object({
      id: z.string(),
      reportType: z.string().nullable(),
      content: z.string().nullable(),
      createdAt: z.string()
    })
  ),
  serialization: z.object({
    serializedSince: z.string().nullable().describe('ISO of SERIALIZED transition, null if never'),
    chaptersPublished: z.number().int()
  })
})
