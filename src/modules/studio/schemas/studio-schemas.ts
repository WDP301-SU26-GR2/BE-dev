import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { $Enums } from '@prisma/client'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { SeriesMiniSchema, UserMiniSchema } from 'src/core/models/user-mini.model'

// ---- CollaborationInvite ----
export const CreateInviteBodySchema = extendApi(
  z
    .object({
      assistantId: z.string(),
      seriesId: z.string().optional().describe('metadata; A4-a KHÔNG validate series tồn tại/sở hữu'),
      hireStart: z.string().datetime({ offset: true }),
      hireEnd: z.string().datetime({ offset: true }),
      taskTypes: z.array(zEnum($Enums.Specialization, 'Specialization')).min(1)
    })
    .strict(),
  {
    title: 'CreateCollaborationInviteBody',
    description: 'Mangaka mời Assistant cộng tác (hireStart < hireEnd, hireEnd tương lai)'
  }
)

export const InviteResSchema = extendApi(
  z.object({
    id: z.string(),
    mangakaId: z.string(),
    assistantId: z.string(),
    seriesId: z.string().nullable(),
    hireStart: z.string().nullable(),
    hireEnd: z.string().nullable(),
    taskTypes: z.array(zEnum($Enums.Specialization, 'Specialization')),
    status: zEnum($Enums.CollaborationInviteStatus, 'CollaborationInviteStatus'),
    createdAt: z.string(),
    mangaka: UserMiniSchema.nullable().optional().describe('Mangaka — có ở GET list/detail'),
    assistant: UserMiniSchema.nullable().optional().describe('Trợ lý — có ở GET list/detail'),
    series: SeriesMiniSchema.nullable().optional().describe('Series — có ở GET list/detail')
  }),
  { title: 'CollaborationInviteRes', description: 'Một lời mời cộng tác' }
)

export const InviteListResSchema = extendApi(
  z.object({ items: z.array(InviteResSchema), total: z.number(), limit: z.number(), offset: z.number() }),
  { title: 'CollaborationInviteListRes', description: 'Danh sách invite phân trang' }
)

export const ListInvitesQuerySchema = extendApi(
  z
    .object({
      status: zEnum($Enums.CollaborationInviteStatus, 'CollaborationInviteStatus').optional(),
      limit: z.coerce.number().int().positive().max(100).default(20),
      offset: z.coerce.number().int().nonnegative().default(0)
    })
    .strict(),
  { title: 'ListInvitesQuery', description: 'Lọc invite (scope theo role)' }
)

// ---- StudioAssignment ----
export const AssignmentResSchema = extendApi(
  z.object({
    id: z.string(),
    mangakaId: z.string(),
    assistantId: z.string(),
    seriesId: z.string().nullable(),
    hireStart: z.string().nullable(),
    hireEnd: z.string().nullable(),
    assignedTaskTypes: z.array(zEnum($Enums.Specialization, 'Specialization')),
    status: zEnum($Enums.StudioAssignmentStatus, 'StudioAssignmentStatus'),
    terminatedReason: z.string().nullable(),
    activeNow: z.boolean().describe('true = status ACTIVE và thời điểm hiện tại trong [hireStart, hireEnd] (lazy)'),
    createdAt: z.string(),
    mangaka: UserMiniSchema.nullable().optional().describe('Mangaka — có ở GET list/detail'),
    assistant: UserMiniSchema.nullable().optional().describe('Trợ lý — có ở GET list/detail'),
    series: SeriesMiniSchema.nullable().optional().describe('Series — có ở GET list/detail')
  }),
  { title: 'StudioAssignmentRes', description: 'Một hợp tác studio' }
)

export const AssignmentListResSchema = extendApi(
  z.object({ items: z.array(AssignmentResSchema), total: z.number(), limit: z.number(), offset: z.number() }),
  { title: 'StudioAssignmentListRes', description: 'Danh sách assignment phân trang' }
)

export const ListAssignmentsQuerySchema = extendApi(
  z
    .object({
      status: zEnum($Enums.StudioAssignmentStatus, 'StudioAssignmentStatus').optional(),
      // 'true' → chỉ trả assignment đang active-now; absent/'false' → không lọc theo active-now.
      activeNow: z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => v === 'true'),
      limit: z.coerce.number().int().positive().max(100).default(20),
      offset: z.coerce.number().int().nonnegative().default(0)
    })
    .strict(),
  { title: 'ListAssignmentsQuery', description: 'Lọc assignment (scope theo role)' }
)

export const TerminateAssignmentBodySchema = extendApi(z.object({ reason: z.string().min(1).max(500) }).strict(), {
  title: 'TerminateAssignmentBody',
  description: 'Lý do kết thúc sớm hợp tác'
})

export type CreateInviteBodyType = z.infer<typeof CreateInviteBodySchema>
export type InviteResType = z.infer<typeof InviteResSchema>
export type ListInvitesQueryType = z.infer<typeof ListInvitesQuerySchema>
export type AssignmentResType = z.infer<typeof AssignmentResSchema>
export type ListAssignmentsQueryType = z.infer<typeof ListAssignmentsQuerySchema>
export type TerminateAssignmentBodyType = z.infer<typeof TerminateAssignmentBodySchema>
