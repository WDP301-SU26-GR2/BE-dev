import { AppConfig } from '@prisma/client'
import { AppConfigResType } from './schemas/app-config-schemas'

export function toAppConfigRes(row: AppConfig): AppConfigResType {
  return {
    id: row.id,
    updatedBy: row.updatedBy,
    coOwnerApprovalGraceDays: row.coOwnerApprovalGraceDays,
    storyboardMaxReviewRounds: row.storyboardMaxReviewRounds,
    reputationRecommendThreshold: row.reputationRecommendThreshold,
    hiatusTooLongDays: row.hiatusTooLongDays,
    lowVoteReliabilityThreshold: row.lowVoteReliabilityThreshold,
    rankingAggregateMinCoverageRatio: row.rankingAggregateMinCoverageRatio,
    maxUploadBytes: row.maxUploadBytes,
    assignmentGraceDays: row.assignmentGraceDays,
    boardRepClaimGraceDays: row.boardRepClaimGraceDays,
    taskOverdueGraceHours: row.taskOverdueGraceHours,
    updatedAt: row.updatedAt.toISOString()
  }
}
