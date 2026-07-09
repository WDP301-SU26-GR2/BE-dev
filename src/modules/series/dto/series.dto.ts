import { createZodDto } from 'nestjs-zod'
import {
  CreateProposalBodySchema,
  CreateProposalResSchema,
  FranchiseConsentBodySchema,
  HiatusBodySchema,
  ListSeriesQuerySchema,
  NameResSchema,
  ProposeCompletionBodySchema,
  ReasonBodySchema,
  SeriesListResSchema,
  SeriesResSchema,
  UpdateProposalBodySchema
} from '../schemas/series-schemas'

export class CreateProposalBodyDto extends createZodDto(CreateProposalBodySchema) {}
export class UpdateProposalBodyDto extends createZodDto(UpdateProposalBodySchema) {}
export class ReasonBodyDto extends createZodDto(ReasonBodySchema) {}
export class SeriesResDto extends createZodDto(SeriesResSchema) {}
export class NameResDto extends createZodDto(NameResSchema) {}
export class CreateProposalResDto extends createZodDto(CreateProposalResSchema) {}
export class ListSeriesQueryDto extends createZodDto(ListSeriesQuerySchema) {}
export class SeriesListResDto extends createZodDto(SeriesListResSchema) {}
export class HiatusBodyDto extends createZodDto(HiatusBodySchema) {}
export class FranchiseConsentBodyDto extends createZodDto(FranchiseConsentBodySchema) {}
export class ProposeCompletionBodyDto extends createZodDto(ProposeCompletionBodySchema) {}
