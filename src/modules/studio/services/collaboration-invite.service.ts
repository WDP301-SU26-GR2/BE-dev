import { Injectable } from '@nestjs/common'
import { NotificationType, Prisma } from '@prisma/client'
import { NotificationService } from 'src/modules/notification/notification.service'
import { RoleName } from 'src/core/security/constants/role.constant'
import {
  AssistantNotFoundException,
  DuplicateActiveCollaborationException,
  InvalidHirePeriodException,
  InviteNotFoundException,
  InviteNotPendingException,
  NotInviteOwnerException,
  NotInviteeException,
  TargetNotAssistantException
} from '../errors/studio.errors'
import { toAssignmentRes, toInviteRes } from '../studio.mapper'
import { StudioRepository } from '../studio.repo'
import { CreateInviteBodyType, ListInvitesQueryType } from '../schemas/studio-schemas'
import { StudioAssignmentService } from './studio-assignment.service'
import { StudioMessages } from '../studio.messages'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class CollaborationInviteService {
  constructor(
    private readonly studioRepository: StudioRepository,
    private readonly studioAssignmentService: StudioAssignmentService,
    private readonly notificationService: NotificationService
  ) {}

  async create(mangakaId: string, body: CreateInviteBodyType) {
    if (!OBJECT_ID_RE.test(body.assistantId)) throw AssistantNotFoundException
    const target = await this.studioRepository.findUserWithRole(body.assistantId)
    if (!target || target.status !== 'ACTIVE') throw AssistantNotFoundException
    if (target.role.code !== RoleName.ASSISTANT) throw TargetNotAssistantException

    const hireStart = new Date(body.hireStart)
    const hireEnd = new Date(body.hireEnd)
    if (!(hireStart < hireEnd) || hireEnd <= new Date()) throw InvalidHirePeriodException

    const pending = await this.studioRepository.findPendingInviteForPair(mangakaId, body.assistantId)
    if (pending) throw DuplicateActiveCollaborationException
    const active = await this.studioAssignmentService.findActiveForPair(mangakaId, body.assistantId)
    if (active) throw DuplicateActiveCollaborationException

    const invite = await this.studioRepository.createInvite({
      mangakaId,
      assistantId: body.assistantId,
      seriesId: body.seriesId ?? null,
      hireStart,
      hireEnd,
      taskTypes: body.taskTypes
    })

    await this.safeNotify(body.assistantId, invite.id, 'INVITE_RECEIVED', StudioMessages.notification.inviteReceived)
    return toInviteRes(invite)
  }

  async accept(assistantId: string, inviteId: string) {
    const invite = await this.requireInvite(inviteId)
    if (invite.assistantId !== assistantId) throw NotInviteeException
    if (invite.status !== 'PENDING') throw InviteNotPendingException

    const result = await this.studioRepository.acceptInvite(invite, new Date())
    if (!result.ok) {
      if (result.reason === 'DUPLICATE_ACTIVE') throw DuplicateActiveCollaborationException
      throw InviteNotPendingException
    }
    await this.safeNotify(invite.mangakaId, invite.id, 'INVITE_ACCEPTED', StudioMessages.notification.inviteAccepted)
    return toAssignmentRes(result.assignment)
  }

  async decline(assistantId: string, inviteId: string) {
    const invite = await this.requireInvite(inviteId)
    if (invite.assistantId !== assistantId) throw NotInviteeException
    if (invite.status !== 'PENDING') throw InviteNotPendingException
    const updated = await this.studioRepository.updateInviteStatus(inviteId, 'DECLINED')
    await this.safeNotify(invite.mangakaId, invite.id, 'INVITE_DECLINED', StudioMessages.notification.inviteDeclined)
    return toInviteRes(updated)
  }

  async cancel(mangakaId: string, inviteId: string) {
    const invite = await this.requireInvite(inviteId)
    if (invite.mangakaId !== mangakaId) throw NotInviteOwnerException
    if (invite.status !== 'PENDING') throw InviteNotPendingException
    const updated = await this.studioRepository.updateInviteStatus(inviteId, 'CANCELLED')
    return toInviteRes(updated)
  }

  async getById(userId: string, inviteId: string) {
    const invite = await this.requireInvite(inviteId)
    if (invite.mangakaId !== userId && invite.assistantId !== userId) throw InviteNotFoundException
    return toInviteRes(invite)
  }

  async list(userId: string, roleName: string, query: ListInvitesQueryType) {
    const scope: Prisma.CollaborationInviteWhereInput =
      roleName === RoleName.ASSISTANT ? { assistantId: userId } : { mangakaId: userId }
    const where: Prisma.CollaborationInviteWhereInput = {
      ...scope,
      ...(query.status ? { status: query.status } : {})
    }
    const page = { limit: query.limit, offset: query.offset }
    const [rows, total] = await Promise.all([
      this.studioRepository.listInvites(where, page),
      this.studioRepository.countInvites(where)
    ])
    return { items: rows.map(toInviteRes), total, limit: query.limit, offset: query.offset }
  }

  private async requireInvite(inviteId: string) {
    if (!OBJECT_ID_RE.test(inviteId)) throw InviteNotFoundException
    const invite = await this.studioRepository.findInviteById(inviteId)
    if (!invite) throw InviteNotFoundException
    return invite
  }

  private async safeNotify(recipientId: string, inviteId: string, referenceType: string, content: string) {
    await this.notificationService.notifySafe({
      recipientId,
      type: NotificationType.SYSTEM,
      referenceId: inviteId,
      referenceType,
      content
    })
  }
}
