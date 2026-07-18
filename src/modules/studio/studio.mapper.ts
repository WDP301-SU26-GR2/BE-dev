import { CollaborationInvite, StudioAssignment } from '@prisma/client'
import { AssignmentResType, InviteResType } from './schemas/studio-schemas'
import { SeriesMiniType, UserMiniType } from 'src/core/models/user-mini.model'

type StudioPeople = {
  mangaka?: UserMiniType | null
  assistant?: UserMiniType | null
  series?: SeriesMiniType | null
}

export function toInviteRes(i: CollaborationInvite & StudioPeople): InviteResType {
  return {
    id: i.id,
    mangakaId: i.mangakaId,
    assistantId: i.assistantId,
    seriesId: i.seriesId ?? null,
    hireStart: i.hireStart ? i.hireStart.toISOString() : null,
    hireEnd: i.hireEnd ? i.hireEnd.toISOString() : null,
    taskTypes: i.taskTypes,
    status: i.status,
    createdAt: i.createdAt.toISOString(),
    ...(i.mangaka !== undefined ? { mangaka: i.mangaka } : {}),
    ...(i.assistant !== undefined ? { assistant: i.assistant } : {}),
    ...(i.series !== undefined ? { series: i.series } : {})
  }
}

// activeNow (lazy): status ACTIVE và `at` ∈ [hireStart, hireEnd].
export function isAssignmentActiveNow(a: StudioAssignment, at: Date = new Date()): boolean {
  return a.status === 'ACTIVE' && a.hireStart != null && a.hireEnd != null && a.hireStart <= at && a.hireEnd >= at
}

export function toAssignmentRes(a: StudioAssignment & StudioPeople, at: Date = new Date()): AssignmentResType {
  return {
    id: a.id,
    mangakaId: a.mangakaId,
    assistantId: a.assistantId,
    seriesId: a.seriesId ?? null,
    hireStart: a.hireStart ? a.hireStart.toISOString() : null,
    hireEnd: a.hireEnd ? a.hireEnd.toISOString() : null,
    assignedTaskTypes: a.assignedTaskTypes,
    status: a.status,
    terminatedReason: a.terminatedReason ?? null,
    activeNow: isAssignmentActiveNow(a, at),
    createdAt: a.createdAt.toISOString(),
    ...(a.mangaka !== undefined ? { mangaka: a.mangaka } : {}),
    ...(a.assistant !== undefined ? { assistant: a.assistant } : {}),
    ...(a.series !== undefined ? { series: a.series } : {})
  }
}
