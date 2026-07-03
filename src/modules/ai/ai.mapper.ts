import { AiJob } from '@prisma/client'
import { ProposedRegionType } from './schemas/ai-schemas'

function base(job: AiJob) {
  return {
    id: job.id,
    type: job.type,
    mode: job.mode ?? null,
    pageId: job.pageId,
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

export function toAiJobRes(job: AiJob) {
  return { ...base(job), proposedRegions: (job.proposedRegions as unknown as ProposedRegionType[] | null) ?? null }
}

export function toAiJobListItem(job: AiJob) {
  return base(job)
}
