import { AiJob, RegionType } from '@prisma/client'
import { ProposedRegionType } from './schemas/ai-schemas'

function base(job: AiJob) {
  return {
    id: job.id,
    type: job.type,
    mode: job.mode ?? null,
    pageId: job.pageId,
    sourceType: job.sourceType,
    sourceFileKey: job.sourceFileKey ?? null,
    sourceRevision: job.sourceRevision ?? null,
    sourceStageId: job.sourceStageId ?? null,
    sourceWidth: job.sourceWidth ?? null,
    sourceHeight: job.sourceHeight ?? null,
    status: job.status,
    error: job.error ?? null,
    modelVersion: job.modelVersion ?? null,
    regionCount: job.regionCount ?? null,
    appliedAt: job.appliedAt ? job.appliedAt.toISOString() : null,
    startedAt: job.startedAt ? job.startedAt.toISOString() : null,
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
    durationMs: job.durationMs ?? null,
    createdAt: job.createdAt.toISOString()
  }
}

export function toAiJobRes(job: AiJob, suggestedTypes?: readonly RegionType[]) {
  const proposedRegions = (
    job.proposedRegions as unknown as Omit<ProposedRegionType, 'suggestedForStage'>[] | null
  )?.map((region) => ({
    ...region,
    suggestedForStage: suggestedTypes == null || suggestedTypes.includes(region.regionType)
  }))
  return { ...base(job), proposedRegions: proposedRegions ?? null }
}

export function toAiJobListItem(job: AiJob) {
  return base(job)
}
