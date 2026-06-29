import { CollaborationInvite, StudioAssignment } from '@prisma/client'
import { AssignmentResType, InviteResType } from './schemas/studio-schemas'

export function toInviteRes(i: CollaborationInvite): InviteResType {
  return {
    id: i.id,
    mangakaId: i.mangakaId,
    assistantId: i.assistantId,
    seriesId: i.seriesId ?? null,
    hireStart: i.hireStart ? i.hireStart.toISOString() : null,
    hireEnd: i.hireEnd ? i.hireEnd.toISOString() : null,
    taskTypes: i.taskTypes,
    status: i.status,
    createdAt: i.createdAt.toISOString()
  }
}

// activeNow (lazy): status ACTIVE và `at` ∈ [hireStart, hireEnd].
export function isAssignmentActiveNow(a: StudioAssignment, at: Date = new Date()): boolean {
  return a.status === 'ACTIVE' && a.hireStart != null && a.hireEnd != null && a.hireStart <= at && a.hireEnd >= at
}

export function toAssignmentRes(a: StudioAssignment, at: Date = new Date()): AssignmentResType {
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
    createdAt: a.createdAt.toISOString()
  }
}
