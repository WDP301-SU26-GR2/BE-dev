import { Injectable } from '@nestjs/common'
import { NotificationType, StudioAssignment } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import { RoleName } from 'src/core/security/constants/role.constant'
import {
  AssignmentNotActiveException,
  AssignmentNotFoundException,
  NotAssignmentOwnerException
} from '../errors/studio.errors'
import { AssignmentListWhere, StudioRepository } from '../studio.repo'
import { toAssignmentRes } from '../studio.mapper'
import { ListAssignmentsQueryType } from '../schemas/studio-schemas'
import { StudioMessages } from '../studio.messages'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class StudioAssignmentService {
  constructor(
    private readonly studioRepository: StudioRepository,
    private readonly notificationService: NotificationService
  ) {}

  async terminate(mangakaId: string, assignmentId: string, reason: string) {
    if (!OBJECT_ID_RE.test(assignmentId)) throw AssignmentNotFoundException
    const assignment = await this.studioRepository.findAssignmentById(assignmentId)
    if (!assignment) throw AssignmentNotFoundException
    if (assignment.mangakaId !== mangakaId) throw NotAssignmentOwnerException

    const count = await this.studioRepository.terminateAssignment(assignmentId, reason)
    if (count === 0) throw AssignmentNotActiveException

    const updated = await this.studioRepository.findAssignmentById(assignmentId)
    if (!updated) throw AssignmentNotFoundException

    await this.notificationService.notifySafe({
      recipientId: updated.assistantId,
      type: NotificationType.SYSTEM,
      referenceId: updated.id,
      referenceType: 'ASSIGNMENT_TERMINATED',
      content: StudioMessages.notification.assignmentTerminated
    })

    return toAssignmentRes(updated)
  }

  async getById(userId: string, roleName: string, assignmentId: string) {
    if (!OBJECT_ID_RE.test(assignmentId)) throw AssignmentNotFoundException
    const assignment = await this.studioRepository.findAssignmentById(assignmentId)
    if (!assignment) throw AssignmentNotFoundException
    if (!this.canAccess(assignment, userId, roleName)) throw AssignmentNotFoundException
    return toAssignmentRes(assignment)
  }

  async list(userId: string, roleName: string, query: ListAssignmentsQueryType) {
    const now = new Date()
    const scope: AssignmentListWhere = roleName === RoleName.ASSISTANT ? { assistantId: userId } : { mangakaId: userId }
    // activeNow=true và status là 2 filter ĐỘC LẬP cùng AND — KHÔNG để activeNow ghi đè
    // field status. status=COMPLETED & activeNow=true ⇒ AND mâu thuẫn ⇒ rỗng (đúng nghiệp vụ),
    // KHÔNG âm thầm đổi status thành ACTIVE.
    const where: AssignmentListWhere = {
      ...scope,
      ...(query.status ? { status: query.status } : {}),
      ...(query.activeNow
        ? { AND: [{ status: 'ACTIVE' }, { hireStart: { lte: now } }, { hireEnd: { gte: now } }] }
        : {})
    }
    const page = { limit: query.limit, offset: query.offset }
    const [rows, total] = await Promise.all([
      this.studioRepository.listAssignments(where, page),
      this.studioRepository.countAssignments(where)
    ])
    return { items: rows.map((r) => toAssignmentRes(r, now)), total, limit: query.limit, offset: query.offset }
  }

  // ---- Exported helpers (A4-b enforce + reviews gate) ----
  async findActiveForPair(
    mangakaId: string,
    assistantId: string,
    at: Date = new Date()
  ): Promise<StudioAssignment | null> {
    return await this.studioRepository.findActiveAssignmentForPair(mangakaId, assistantId, at)
  }

  async findEndedForPairById(
    mangakaId: string,
    assistantId: string,
    assignmentId: string
  ): Promise<StudioAssignment | null> {
    if (!OBJECT_ID_RE.test(assignmentId)) return null
    const a = await this.studioRepository.findAssignmentById(assignmentId)
    if (!a || a.mangakaId !== mangakaId || a.assistantId !== assistantId) return null
    const now = new Date()
    const ended =
      a.status === 'COMPLETED' ||
      a.status === 'TERMINATED' ||
      (a.status === 'ACTIVE' && a.hireEnd != null && a.hireEnd < now)
    return ended ? a : null
  }

  private canAccess(a: StudioAssignment, userId: string, roleName: string): boolean {
    if (roleName === RoleName.ASSISTANT) return a.assistantId === userId
    return a.mangakaId === userId
  }
}
