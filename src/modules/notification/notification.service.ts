import { Injectable, Logger } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { NotificationRepository } from './notification.repo'

export interface NotifyInput {
  recipientId: string
  type: NotificationType
  referenceId?: string | null
  referenceType?: string | null
  content?: string | null
}

/**
 * Shared notification service (Sprint 0 — S0-5). Any module injects this and calls
 * `notify(...)` to push an in-app notification. Provided globally via NotificationModule.
 *
 * Idempotent per (recipientId + type + referenceId + referenceType): re-notifying the
 * same event for the same recipient returns the existing record instead of duplicating
 * (A-NOT-01). Best-effort (find-then-create); acceptable at project scale.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)

  constructor(private readonly notificationRepository: NotificationRepository) {}

  async notify(input: NotifyInput) {
    const key = {
      recipientId: input.recipientId,
      type: input.type,
      referenceId: input.referenceId ?? null,
      referenceType: input.referenceType ?? null
    }

    const existing = await this.notificationRepository.findDuplicate(key)
    if (existing) return existing

    return await this.notificationRepository.create({
      ...key,
      content: input.content ?? null
    })
  }

  async notifySafe(input: NotifyInput): Promise<void> {
    try {
      await this.notify(input)
    } catch (error) {
      this.logger.warn(
        `notify failed (recipient=${input.recipientId}, type=${input.type}, ref=${input.referenceType ?? 'null'}): ${String(error)}`
      )
    }
  }
}

export { NotificationType }
