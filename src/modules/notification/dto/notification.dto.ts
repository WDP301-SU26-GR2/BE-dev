import { createZodDto } from 'nestjs-zod'
import {
  ListNotificationsQuerySchema,
  NotificationListResSchema,
  NotificationResSchema,
  ReadAllResSchema
} from '../schemas/notification-schemas'

export class ListNotificationsQueryDto extends createZodDto(ListNotificationsQuerySchema) {}
export class NotificationResDto extends createZodDto(NotificationResSchema) {}
export class NotificationListResDto extends createZodDto(NotificationListResSchema) {}
export class ReadAllResDto extends createZodDto(ReadAllResSchema) {}
