import { Injectable, Logger } from '@nestjs/common'
import { NotificationType } from '@prisma/client'
import { createHash } from 'node:crypto'
import { isUniqueConstrainError } from 'src/infrastructure/database/prisma-error.helper'
import { NotificationRepository } from './notification.repo'

export interface NotifyInput {
  recipientId: string
  type: NotificationType
  referenceId?: string | null
  referenceType?: string | null
  content?: string | null
}

export function buildDedupeKey(input: NotifyInput): string {
  const contentHash = createHash('sha1')
    .update(input.content ?? '')
    .digest('hex')
    .slice(0, 16)
  return `${input.recipientId}|${input.type ?? ''}|${input.referenceId ?? ''}|${input.referenceType ?? ''}|${contentHash}`
}

/**
 * Shared notification service (Sprint 0 — S0-5). Any module injects this and calls
 * `notify(...)` to push an in-app notification. Provided globally via NotificationModule.
 *
 * Idempotent per the unique dedupe key: a concurrent duplicate create returns the
 * existing record instead of creating a second notification (A-NOT-01).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)

  constructor(private readonly notificationRepository: NotificationRepository) {}

  async notify(input: NotifyInput) {
    const data = {
      recipientId: input.recipientId,
      type: input.type,
      referenceId: input.referenceId ?? null,
      referenceType: input.referenceType ?? null
    }
    const dedupeKey = buildDedupeKey(input)

    try {
      return await this.notificationRepository.create({ ...data, content: input.content ?? null, dedupeKey })
    } catch (error) {
      if (!isUniqueConstrainError(error)) throw error

      const existing = await this.notificationRepository.findByDedupeKey(dedupeKey)
      if (existing) return existing
      throw error
    }
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
