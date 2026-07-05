import { createZodDto } from 'nestjs-zod'
import { AuditLogListResSchema, ListAuditLogsQuerySchema } from '../schemas/audit-schemas'

export class ListAuditLogsQueryDto extends createZodDto(ListAuditLogsQuerySchema) {}
export class AuditLogListResDto extends createZodDto(AuditLogListResSchema) {}
