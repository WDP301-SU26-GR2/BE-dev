import { Injectable } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

export interface CreateNotificationData {
  recipientId: string
  type: NotificationType
  referenceId: string | null
  referenceType: string | null
  content: string | null
}

@Injectable()
export class NotificationRepository {
  constructor(private readonly prismaService: PrismaService) {}

  // Idempotency lookup (recipient + type + ref) — A-NOT-01.
  async findDuplicate(where: {
    recipientId: string
    type: NotificationType
    referenceId: string | null
    referenceType: string | null
  }) {
    return await this.prismaService.notification.findFirst({ where })
  }

  async create(data: CreateNotificationData) {
    return await this.prismaService.notification.create({ data })
  }

  findForRecipient(
    recipientId: string,
    filter: { isRead?: boolean; type?: NotificationType },
    page: { limit: number; offset: number }
  ) {
    return this.prismaService.notification.findMany({
      where: {
        recipientId,
        ...(filter.isRead !== undefined ? { isRead: filter.isRead } : {}),
        ...(filter.type ? { type: filter.type } : {})
      },
      orderBy: { createdAt: 'desc' },
      skip: page.offset,
      take: page.limit
    })
  }

  countForRecipient(recipientId: string, filter: { isRead?: boolean; type?: NotificationType }) {
    return this.prismaService.notification.count({
      where: {
        recipientId,
        ...(filter.isRead !== undefined ? { isRead: filter.isRead } : {}),
        ...(filter.type ? { type: filter.type } : {})
      }
    })
  }

  countUnread(recipientId: string) {
    return this.prismaService.notification.count({ where: { recipientId, isRead: false } })
  }

  async markRead(id: string, recipientId: string) {
    const existing = await this.prismaService.notification.findFirst({ where: { id, recipientId } })
    if (!existing) return null
    if (existing.isRead) return existing
    return this.prismaService.notification.update({ where: { id }, data: { isRead: true } })
  }

  async markAllRead(recipientId: string) {
    const result = await this.prismaService.notification.updateMany({
      where: { recipientId, isRead: false },
      data: { isRead: true }
    })
    return result.count
  }
}
