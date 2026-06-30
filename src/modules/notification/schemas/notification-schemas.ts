import { extendApi } from '@anatine/zod-openapi'
import { $Enums } from '@prisma/client'
import { z } from 'zod'
import { zEnum } from 'src/core/http/docs/enum-docs'

const IsReadQuerySchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'))

export const ListNotificationsQuerySchema = extendApi(
  z
    .object({
      isRead: IsReadQuerySchema,
      type: zEnum($Enums.NotificationType, 'NotificationType').optional(),
      limit: z.coerce.number().int().positive().max(100).default(20),
      offset: z.coerce.number().int().nonnegative().default(0)
    })
    .strict(),
  { title: 'ListNotificationsQuery', description: 'Filter thông báo của user hiện tại' }
)

export const NotificationResSchema = extendApi(
  z.object({
    id: z.string(),
    type: zEnum($Enums.NotificationType, 'NotificationType').nullable(),
    referenceId: z.string().nullable().describe('ID thực thể liên quan (chapter/task/...)'),
    referenceType: z.string().nullable().describe('Loại thực thể của referenceId'),
    content: z.string().nullable(),
    isRead: z.boolean(),
    createdAt: z.string().describe('ISO 8601')
  }),
  { title: 'NotificationRes', description: 'Notification view' }
)

export const NotificationListResSchema = extendApi(
  z.object({
    items: z.array(NotificationResSchema),
    total: z.number(),
    unreadCount: z.number().describe('Tổng số chưa đọc (độc lập filter, dùng cho badge)'),
    limit: z.number(),
    offset: z.number()
  }),
  { title: 'NotificationListRes', description: 'Danh sách notification của user hiện tại' }
)

export const ReadAllResSchema = extendApi(
  z.object({ updated: z.number().describe('Số notification vừa được đánh dấu đã đọc') }),
  { title: 'ReadAllRes', description: 'Kết quả mark-all-read' }
)

export type ListNotificationsQueryType = z.infer<typeof ListNotificationsQuerySchema>
export type NotificationResType = z.infer<typeof NotificationResSchema>
