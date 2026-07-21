import { Asset, Region, Task } from '@prisma/client'
import { UserMiniType } from 'src/core/models/user-mini.model'

type TaskAssetEmbed = Pick<Asset, 'id' | 'filePath' | 'name' | 'assetType'>

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
  regions?: Region[]
  assets?: TaskAssetEmbed[]
  pageOriginalFile?: string | null
  pageDisplayFile?: string | null
  versions: Array<Task['versions'][number] & { submitter?: UserMiniType | null }>
}

export function toTaskRes(t: TaskWithPeople) {
  return {
    id: t.id,
    pageId: t.pageId,
    regionIds: t.regionIds ?? [],
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
    groupId: t.groupId ?? null,
    groupTitle: t.groupTitle ?? null,
    ...(t.assistant !== undefined ? { assistant: t.assistant } : {}),
    ...(t.regions !== undefined ? { regions: t.regions.map(toRegionRes) } : {}),
    ...(t.assets !== undefined
      ? {
          assets: t.assets.map((a) => ({
            id: a.id,
            filePath: a.filePath,
            name: a.name,
            assetType: a.assetType ?? null
          }))
        }
      : {}),
    ...(t.pageOriginalFile !== undefined ? { pageOriginalFile: t.pageOriginalFile } : {}),
    ...(t.pageDisplayFile !== undefined ? { pageDisplayFile: t.pageDisplayFile } : {})
  }
}
