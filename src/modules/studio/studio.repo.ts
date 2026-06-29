import { Injectable } from '@nestjs/common'
import { CollaborationInvite, Prisma, Specialization, StudioAssignment } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

export type AssignmentListWhere = Prisma.StudioAssignmentWhereInput

@Injectable()
export class StudioRepository {
  constructor(private readonly prismaService: PrismaService) {}

  // ---- User lookup (validate target assistant; KHÔNG import users module) ----
  // Gotcha §10: lọc chưa-xoá-mềm bằng isSet:false.
  async findUserWithRole(userId: string) {
    return await this.prismaService.user.findFirst({
      where: { id: userId, deletedAt: { isSet: false } },
      select: { id: true, status: true, role: { select: { code: true } } }
    })
  }

  // ---- CollaborationInvite ----
  async createInvite(data: {
    mangakaId: string
    assistantId: string
    seriesId: string | null
    hireStart: Date
    hireEnd: Date
    taskTypes: Specialization[]
  }): Promise<CollaborationInvite> {
    return await this.prismaService.collaborationInvite.create({ data: { ...data, status: 'PENDING' } })
  }

  async findInviteById(id: string): Promise<CollaborationInvite | null> {
    return await this.prismaService.collaborationInvite.findUnique({ where: { id } })
  }

  async findPendingInviteForPair(mangakaId: string, assistantId: string): Promise<CollaborationInvite | null> {
    return await this.prismaService.collaborationInvite.findFirst({
      where: { mangakaId, assistantId, status: 'PENDING' }
    })
  }

  async updateInviteStatus(id: string, status: 'DECLINED' | 'CANCELLED'): Promise<CollaborationInvite> {
    return await this.prismaService.collaborationInvite.update({ where: { id }, data: { status } })
  }

  async listInvites(where: Prisma.CollaborationInviteWhereInput, page: { limit: number; offset: number }) {
    return await this.prismaService.collaborationInvite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: page.offset,
      take: page.limit
    })
  }

  async countInvites(where: Prisma.CollaborationInviteWhereInput): Promise<number> {
    return await this.prismaService.collaborationInvite.count({ where })
  }

  // Accept atomically: re-check active-now dedup + flip PENDING→ACCEPTED + create ACTIVE assignment.
  // Trả discriminated result (KHÔNG throw business exception ở repo — service map sang exception).
  async acceptInvite(
    invite: CollaborationInvite,
    at: Date
  ): Promise<{ ok: true; assignment: StudioAssignment } | { ok: false; reason: 'NOT_PENDING' | 'DUPLICATE_ACTIVE' }> {
    return await this.prismaService.$transaction(async (tx) => {
      const active = await tx.studioAssignment.findFirst({
        where: {
          mangakaId: invite.mangakaId,
          assistantId: invite.assistantId,
          status: 'ACTIVE',
          hireStart: { lte: at },
          hireEnd: { gte: at }
        }
      })
      if (active) return { ok: false, reason: 'DUPLICATE_ACTIVE' } as const

      const upd = await tx.collaborationInvite.updateMany({
        where: { id: invite.id, status: 'PENDING' },
        data: { status: 'ACCEPTED' }
      })
      if (upd.count === 0) return { ok: false, reason: 'NOT_PENDING' } as const

      const assignment = await tx.studioAssignment.create({
        data: {
          mangakaId: invite.mangakaId,
          assistantId: invite.assistantId,
          seriesId: invite.seriesId,
          hireStart: invite.hireStart,
          hireEnd: invite.hireEnd,
          assignedTaskTypes: invite.taskTypes,
          status: 'ACTIVE'
        }
      })
      return { ok: true, assignment } as const
    })
  }

  // ---- StudioAssignment ----
  async findAssignmentById(id: string): Promise<StudioAssignment | null> {
    return await this.prismaService.studioAssignment.findUnique({ where: { id } })
  }

  async findActiveAssignmentForPair(
    mangakaId: string,
    assistantId: string,
    at: Date
  ): Promise<StudioAssignment | null> {
    return await this.prismaService.studioAssignment.findFirst({
      where: { mangakaId, assistantId, status: 'ACTIVE', hireStart: { lte: at }, hireEnd: { gte: at } }
    })
  }

  // Atomic terminate: chỉ thành công khi đang ACTIVE → trả count.
  async terminateAssignment(id: string, reason: string): Promise<number> {
    const res = await this.prismaService.studioAssignment.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'TERMINATED', terminatedReason: reason }
    })
    return res.count
  }

  async listAssignments(where: AssignmentListWhere, page: { limit: number; offset: number }) {
    return await this.prismaService.studioAssignment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: page.offset,
      take: page.limit
    })
  }

  async countAssignments(where: AssignmentListWhere): Promise<number> {
    return await this.prismaService.studioAssignment.count({ where })
  }
}
