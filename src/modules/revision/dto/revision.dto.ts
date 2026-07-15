import { createZodDto } from 'nestjs-zod'
import {
  ListRevisionRequestsQuerySchema,
  RevisionRequestListResSchema,
  RevisionRequestResSchema
} from '../schemas/revision-schemas'

export class ListRevisionRequestsQueryDto extends createZodDto(ListRevisionRequestsQuerySchema) {}
export class RevisionRequestResDto extends createZodDto(RevisionRequestResSchema) {}
export class RevisionRequestListResDto extends createZodDto(RevisionRequestListResSchema) {}
