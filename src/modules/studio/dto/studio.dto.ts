import { createZodDto } from 'nestjs-zod'
import {
  AssignmentListResSchema,
  AssignmentResSchema,
  CreateInviteBodySchema,
  InviteListResSchema,
  InviteResSchema,
  ListAssignmentsQuerySchema,
  ListInvitesQuerySchema,
  TerminateAssignmentBodySchema
} from '../schemas/studio-schemas'

export class CreateInviteBodyDto extends createZodDto(CreateInviteBodySchema) {}
export class InviteResDto extends createZodDto(InviteResSchema) {}
export class InviteListResDto extends createZodDto(InviteListResSchema) {}
export class ListInvitesQueryDto extends createZodDto(ListInvitesQuerySchema) {}
export class AssignmentResDto extends createZodDto(AssignmentResSchema) {}
export class AssignmentListResDto extends createZodDto(AssignmentListResSchema) {}
export class ListAssignmentsQueryDto extends createZodDto(ListAssignmentsQuerySchema) {}
export class TerminateAssignmentBodyDto extends createZodDto(TerminateAssignmentBodySchema) {}
