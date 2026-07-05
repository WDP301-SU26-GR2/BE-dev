import { extendApi } from '@anatine/zod-openapi'
import { z } from 'zod'

const MAX_UPLOAD_BYTES_CAP = 50 * 1024 * 1024

const intPositive = (description: string) => z.number().int().positive().describe(description)
const intNonnegative = (description: string) => z.number().int().nonnegative().describe(description)

export const AppConfigResSchema = extendApi(
  z.object({
    id: z.string(),
    updatedBy: z.string().nullable().describe('Admin user id that last updated app config'),
    coOwnerApprovalGraceDays: z.number().int().nonnegative().describe('Grace days for co-owner approval flows'),
    nameMaxReviewRounds: z.number().int().positive().describe('Maximum name review rounds before loop warning'),
    reputationRecommendThreshold: z.number().min(1).max(5).describe('Minimum reputation score for recommendations'),
    hiatusTooLongDays: z.number().int().positive().describe('Days before a hiatus is considered too long'),
    lowVoteReliabilityThreshold: z.number().int().nonnegative().describe('Vote count below which reliability is low'),
    maxUploadBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES_CAP).describe('Maximum upload size in bytes'),
    assignmentGraceDays: z.number().int().nonnegative().describe('Grace days around assignment lifecycle checks'),
    updatedAt: z.string()
  }),
  { title: 'AppConfigRes', description: 'Application-wide runtime configuration' }
)

export const PatchAppConfigBodySchema = extendApi(
  z
    .object({
      coOwnerApprovalGraceDays: intNonnegative('Grace days for co-owner approval flows').nullable().optional(),
      nameMaxReviewRounds: intPositive('Maximum name review rounds before loop warning').nullable().optional(),
      reputationRecommendThreshold: z
        .number()
        .min(1)
        .max(5)
        .describe('Minimum reputation score for recommendations')
        .nullable()
        .optional(),
      hiatusTooLongDays: intPositive('Days before a hiatus is considered too long').nullable().optional(),
      lowVoteReliabilityThreshold: intNonnegative('Vote count below which reliability is low').nullable().optional(),
      maxUploadBytes: z
        .number()
        .int()
        .positive()
        .max(MAX_UPLOAD_BYTES_CAP)
        .describe('Maximum upload size in bytes; hard cap is 50MB')
        .nullable()
        .optional(),
      assignmentGraceDays: intNonnegative('Grace days around assignment lifecycle checks').nullable().optional()
    })
    .strict(),
  { title: 'PatchAppConfigBody', description: 'Partial app config update; null fields are ignored' }
)

export type AppConfigResType = z.infer<typeof AppConfigResSchema>
export type PatchAppConfigBodyType = z.infer<typeof PatchAppConfigBodySchema>
