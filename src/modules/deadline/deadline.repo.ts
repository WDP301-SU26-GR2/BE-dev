import { Injectable } from '@nestjs/common'
import { DeadlineRequestStatus, Prisma } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { DeadlineSide, DEADLINE_CLOSED_STATES, DEADLINE_RESOLVED_STATES } from './deadline.constant'

export interface CreateDeadlineRequestData {
  scheduleId: string
  chapterId: string
  seriesId: string
  requestedBy: DeadlineSide
  currentDeadline: Date | null
  requestedDeadline: Date
  reason: string
  affectsSlot: boolean
  createdById: string
}

@Injectable()
export class DeadlineRepository {
  constructor(private readonly prismaService: PrismaService) {}

  findById(id: string) {
    return this.prismaService.deadlineRequest.findUnique({ where: { id } })
  }

  findOpenByChapter(chapterId: string) {
    return this.prismaService.deadlineRequest.findFirst({
      where: { chapterId, status: { notIn: DEADLINE_CLOSED_STATES } }
    })
  }

  listByChapter(chapterId: string, status?: DeadlineRequestStatus) {
    return this.prismaService.deadlineRequest.findMany({
      where: { chapterId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' }
    })
  }

  create(data: CreateDeadlineRequestData) {
    return this.prismaService.deadlineRequest.create({
      data: {
        scheduleId: data.scheduleId,
        chapterId: data.chapterId,
        seriesId: data.seriesId,
        requestedBy: data.requestedBy,
        lastProposedBy: data.requestedBy,
        currentDeadline: data.currentDeadline,
        requestedDeadline: data.requestedDeadline,
        reason: data.reason,
        affectsSlot: data.affectsSlot,
        status: DeadlineRequestStatus.PROPOSED,
        statusHistory: [
          {
            from: null,
            to: DeadlineRequestStatus.PROPOSED,
            by: data.createdById,
            reason: data.reason
          }
        ]
      }
    })
  }

  applyTransition(
    id: string,
    args: {
      from: DeadlineRequestStatus
      to: DeadlineRequestStatus
      by: string
      reason?: string | null
      extra?: Prisma.DeadlineRequestUpdateInput
    }
  ) {
    const resolvedAt = DEADLINE_RESOLVED_STATES.has(args.to) ? new Date() : undefined
    return this.prismaService.deadlineRequest.update({
      where: { id },
      data: {
        ...(args.extra ?? {}),
        status: args.to,
        resolvedAt,
        statusHistory: {
          push: {
            from: args.from,
            to: args.to,
            by: args.by,
            reason: args.reason ?? null
          }
        }
      }
    })
  }
}
