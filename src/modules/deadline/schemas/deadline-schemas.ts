import { extendApi } from '@anatine/zod-openapi'
import { $Enums } from '@prisma/client'
import { z } from 'zod'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { ChapterMiniSchema, SeriesMiniSchema } from 'src/core/models/user-mini.model'

const zFutureDeadline = z
  .string()
  .datetime({ offset: true })
  .refine((value) => new Date(value).getTime() > Date.now(), {
    message: 'Deadline phải ở trong tương lai'
  })

export const CreateDeadlineRequestBodySchema = extendApi(
  z
    .object({
      chapterId: z.string().min(1),
      requestedDeadline: zFutureDeadline,
      reason: z.string().min(1).max(1000)
    })
    .strict(),
  { title: 'CreateDeadlineRequestBody', description: 'Tạo yêu cầu thương lượng deadline' }
)

export const CounterDeadlineBodySchema = extendApi(
  z
    .object({
      requestedDeadline: zFutureDeadline,
      reason: z.string().min(1).max(1000)
    })
    .strict(),
  { title: 'CounterDeadlineBody', description: 'Counter deadline mới' }
)

export const DeadlineReasonBodySchema = extendApi(z.object({ reason: z.string().min(1).max(1000) }).strict(), {
  title: 'DeadlineReasonBody',
  description: 'Lý do reject/escalate deadline'
})

export const BoardResolveBodySchema = extendApi(
  z
    .object({
      decision: z
        .enum(['APPROVE', 'REJECT'])
        .describe('Board quyết định: APPROVE → cập nhật Schedule; REJECT → giữ nguyên'),
      note: z.string().max(1000).nullish()
    })
    .strict(),
  {
    title: 'BoardResolveBody',
    description: 'A-DL-03: Board chốt DeadlineRequest BOARD_REVIEW/ESCALATED'
  }
)

export const ListDeadlineRequestQuerySchema = extendApi(
  z
    .object({
      chapterId: z.string().min(1),
      status: zEnum($Enums.DeadlineRequestStatus, 'DeadlineRequestStatus').optional()
    })
    .strict(),
  { title: 'ListDeadlineRequestQuery', description: 'List deadline-request theo chapter' }
)

export const DeadlineRequestResSchema = extendApi(
  z.object({
    id: z.string(),
    scheduleId: z.string(),
    chapterId: z.string().nullable(),
    seriesId: z.string().nullable(),
    requestedBy: z.string().nullable().describe("Phe khởi tạo: 'MANGAKA' | 'EDITOR'"),
    lastProposedBy: z.string().nullable().describe('Phe đề xuất gần nhất'),
    currentDeadline: z.string().nullable(),
    requestedDeadline: z.string().nullable(),
    reason: z.string().nullable(),
    affectsSlot: z.boolean(),
    status: zEnum($Enums.DeadlineRequestStatus, 'DeadlineRequestStatus'),
    boardReviewedBy: z.string().nullable(),
    resolvedAt: z.string().nullable(),
    createdAt: z.string(),
    series: SeriesMiniSchema.nullable().optional().describe('Thông tin series — có ở GET list/detail'),
    chapter: ChapterMiniSchema.nullable().optional().describe('Thông tin chương — có ở GET list/detail')
  }),
  { title: 'DeadlineRequestRes', description: 'Deadline request view' }
)

export const DeadlineRequestListResSchema = extendApi(z.object({ items: z.array(DeadlineRequestResSchema) }), {
  title: 'DeadlineRequestListRes',
  description: 'Danh sách deadline request'
})

export type CreateDeadlineRequestBodyType = z.infer<typeof CreateDeadlineRequestBodySchema>
export type CounterDeadlineBodyType = z.infer<typeof CounterDeadlineBodySchema>
export type DeadlineReasonBodyType = z.infer<typeof DeadlineReasonBodySchema>
export type BoardResolveBodyType = z.infer<typeof BoardResolveBodySchema>
export type ListDeadlineRequestQueryType = z.infer<typeof ListDeadlineRequestQuerySchema>
export type DeadlineRequestResType = z.infer<typeof DeadlineRequestResSchema>
