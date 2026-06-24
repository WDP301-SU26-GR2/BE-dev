import { createZodDto } from 'nestjs-zod'
import {
  CreateProposalBodySchema,
  CreateProposalResSchema,
  NameResSchema,
  ReasonBodySchema,
  SeriesResSchema,
  UpdateNamePagesBodySchema,
  UpdateProposalBodySchema
} from '../schemas/series-schemas'

export class CreateProposalBodyDto extends createZodDto(CreateProposalBodySchema) {}
export class UpdateProposalBodyDto extends createZodDto(UpdateProposalBodySchema) {}
export class ReasonBodyDto extends createZodDto(ReasonBodySchema) {}
export class UpdateNamePagesBodyDto extends createZodDto(UpdateNamePagesBodySchema) {}
export class SeriesResDto extends createZodDto(SeriesResSchema) {}
export class NameResDto extends createZodDto(NameResSchema) {}
export class CreateProposalResDto extends createZodDto(CreateProposalResSchema) {}
