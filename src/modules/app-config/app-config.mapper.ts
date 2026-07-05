import { AppConfig } from '@prisma/client'
import { AppConfigResType } from './schemas/app-config-schemas'

export function toAppConfigRes(row: AppConfig): AppConfigResType {
  return {
    id: row.id,
    updatedBy: row.updatedBy,
    coOwnerApprovalGraceDays: row.coOwnerApprovalGraceDays,
    nameMaxReviewRounds: row.nameMaxReviewRounds,
    reputationRecommendThreshold: row.reputationRecommendThreshold,
    hiatusTooLongDays: row.hiatusTooLongDays,
    lowVoteReliabilityThreshold: row.lowVoteReliabilityThreshold,
    maxUploadBytes: row.maxUploadBytes,
    assignmentGraceDays: row.assignmentGraceDays,
    updatedAt: row.updatedAt.toISOString()
  }
}
