import { Region, Task } from '@prisma/client'
import { UserMiniType } from 'src/core/models/user-mini.model'

export function toRegionRes(r: Region) {
  return {
    id: r.id,
    pageId: r.pageId,
    coordinates: (r.coordinates as { x: number; y: number; width: number; height: number } | null) ?? null,
    regionType: r.regionType ?? null,
    createdBy: r.createdBy ?? null,
    confirmedByMangaka: r.confirmedByMangaka,
    confidenceScore: r.confidenceScore ?? null,
    detectedSubtype: r.detectedSubtype ?? null,
    aiModelVersion: r.aiModelVersion ?? null
  }
}

type TaskWithPeople = Omit<Task, 'versions'> & {
  assistant?: UserMiniType | null
  region?: Region | null
  versions: Array<Task['versions'][number] & { submitter?: UserMiniType | null }>
}

export function toTaskRes(t: TaskWithPeople) {
  return {
    id: t.id,
    pageId: t.pageId,
    regionId: t.regionId ?? null,
    assistantId: t.assistantId ?? null,
    taskType: t.taskType ?? null,
    status: t.status,
    statusReason: t.statusReason ?? null,
    priority: t.priority,
    deadline: t.deadline ? t.deadline.toISOString() : null,
    assetIds: t.assetIds ?? [],
    versions: (t.versions ?? []).map((v) => ({
      submittedBy: v.submittedBy ?? null,
      versionNumber: v.versionNumber,
      file: v.file ?? null,
      reviewStatus: v.reviewStatus,
      reviewerNote: v.reviewerNote ?? null,
      submittedAt: v.submittedAt.toISOString(),
      ...(v.submitter !== undefined ? { submitter: v.submitter } : {})
    })),
    createdAt: t.createdAt.toISOString(),
    ...(t.assistant !== undefined ? { assistant: t.assistant } : {}),
    ...(t.region !== undefined ? { region: t.region ? toRegionRes(t.region) : null } : {})
  }
}
