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
}
