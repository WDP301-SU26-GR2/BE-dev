import { extendApi } from '@anatine/zod-openapi'
import { RevisionTargetType } from '@prisma/client'
import { z } from 'zod'
import { zEnum } from 'src/core/http/docs/enum-docs'

const IsResolvedQuerySchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'))

export const ListRevisionRequestsQuerySchema = extendApi(
  z
    .object({
      targetType: zEnum(RevisionTargetType, 'RevisionTargetType').optional(),
      targetId: z.string().optional().describe('seriesId | nameId | chapterId | taskId theo targetType'),
      isResolved: IsResolvedQuerySchema.describe('omit = tất cả; true = đã xử lý; false = còn tồn'),
      limit: z.coerce.number().int().positive().max(100).default(20),
      offset: z.coerce.number().int().nonnegative().default(0)
    })
    .strict(),
  {
    title: 'ListRevisionRequestsQuery',
    description: 'Lọc vòng yêu cầu sửa (scope theo người trong cuộc)'
  }
)

export const RevisionRequestResSchema = extendApi(
  z.object({
    id: z.string(),
    targetType: zEnum(RevisionTargetType, 'RevisionTargetType'),
    targetId: z.string(),
    seriesId: z.string().nullable().describe('null với TASK'),
    round: z.number().describe('lần yêu cầu sửa thứ mấy trên cùng target: 1, 2, 3...'),
    reason: z.string(),
    requestedBy: z.string(),
    recipientId: z.string().describe('người phải sửa — CHỈ người này resolve được'),
    isResolved: z.boolean(),
    resolvedAt: z.string().nullable(),
    resolvedBy: z.string().nullable(),
    createdAt: z.string()
  }),
  { title: 'RevisionRequestRes', description: 'Một vòng yêu cầu sửa' }
)

export const RevisionRequestListResSchema = extendApi(
  z.object({
    items: z.array(RevisionRequestResSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number()
  }),
  { title: 'RevisionRequestListRes', description: 'Danh sách vòng yêu cầu sửa, phân trang' }
)

export type ListRevisionRequestsQueryType = z.infer<typeof ListRevisionRequestsQuerySchema>
export type RevisionRequestResType = z.infer<typeof RevisionRequestResSchema>
