import { createZodDto } from 'nestjs-zod'
import {
  CreateAmendmentBodySchema,
  UpdateAmendmentBodySchema,
  RejectAmendmentBodySchema,
  VoidAmendmentBodySchema,
  SignAmendmentBodySchema,
  AmendmentListItemSchema,
  AmendmentResSchema
} from '../schemas/contract-amendment-schema'

export class CreateAmendmentBodyDto extends createZodDto(CreateAmendmentBodySchema) {}
export class UpdateAmendmentBodyDto extends createZodDto(UpdateAmendmentBodySchema) {}
export class RejectAmendmentBodyDto extends createZodDto(RejectAmendmentBodySchema) {}
export class VoidAmendmentBodyDto extends createZodDto(VoidAmendmentBodySchema) {}
export class SignAmendmentBodyDto extends createZodDto(SignAmendmentBodySchema) {}
export class AmendmentListItemDto extends createZodDto(AmendmentListItemSchema) {}
export class AmendmentResDto extends createZodDto(AmendmentResSchema) {}
