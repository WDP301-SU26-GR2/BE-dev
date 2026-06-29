import { Region, Task } from '@prisma/client'

export function toRegionRes(r: Region) {
  return {
    id: r.id,
    pageId: r.pageId,
    coordinates: (r.coordinates as { x: number; y: number; width: number; height: number } | null) ?? null,
    regionType: r.regionType ?? null,
    createdBy: r.createdBy ?? null,
    confirmedByMangaka: r.confirmedByMangaka,
    confidenceScore: r.confidenceScore ?? null
  }
}

export function toTaskRes(t: Task) {
  return {
    id: t.id,
    pageId: t.pageId,
    regionId: t.regionId ?? null,
    assistantId: t.assistantId ?? null,
    taskType: t.taskType ?? null,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline ? t.deadline.toISOString() : null,
    assetIds: t.assetIds ?? [],
    versions: (t.versions ?? []).map((v) => ({
      submittedBy: v.submittedBy ?? null,
      versionNumber: v.versionNumber,
      file: v.file ?? null,
      reviewStatus: v.reviewStatus,
      reviewerNote: v.reviewerNote ?? null,
      submittedAt: v.submittedAt.toISOString()
    })),
    createdAt: t.createdAt.toISOString()
  }
}
