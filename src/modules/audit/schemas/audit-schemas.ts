import { extendApi } from '@anatine/zod-openapi'
import { AuditEntityType } from '@prisma/client'
import { z } from 'zod'
import { zEnum } from 'src/core/http/docs/enum-docs'

export const ListAuditLogsQuerySchema = extendApi(
  z
    .object({
      entityType: zEnum(AuditEntityType, 'AuditEntityType').optional(),
      entityId: z.string().optional().describe('Id entity bị tác động'),
      actorId: z.string().optional().describe('Id user thao tác'),
      action: z.string().optional().describe('TRANSITION | HOLD | RESUME | BAN | ... (string chuẩn hóa)'),
      limit: z.coerce.number().int().positive().max(100).default(20),
      offset: z.coerce.number().int().nonnegative().default(0)
    })
    .strict(),
  { title: 'ListAuditQuery', description: 'Lọc audit log (SUPER_ADMIN/BOARD_MEMBER)' }
)

export const AuditLogResSchema = extendApi(
  z.object({
    id: z.string(),
    actorId: z.string().nullable().describe('null = hành động hệ thống (cron/listener)'),
    entityType: zEnum(AuditEntityType, 'AuditEntityType'),
    entityId: z.string(),
    action: z.string(),
    fromState: z.string().nullable(),
    toState: z.string().nullable(),
    reason: z.string().nullable(),
    createdAt: z.string()
  }),
  { title: 'AuditLogRes', description: 'Một dòng audit' }
)

export const AuditLogListResSchema = extendApi(
  z.object({ items: z.array(AuditLogResSchema), total: z.number(), limit: z.number(), offset: z.number() }),
  { title: 'AuditListRes', description: 'Danh sách audit phân trang' }
)

export type ListAuditLogsQueryType = z.infer<typeof ListAuditLogsQuerySchema>
export type AuditLogResType = z.infer<typeof AuditLogResSchema>
