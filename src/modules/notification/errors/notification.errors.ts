import { NotFoundException } from '@nestjs/common'
import { NotificationMessages } from '../notification.messages'

const E = NotificationMessages.error

export const NotificationNotFoundException = new NotFoundException(E.notificationNotFound)
