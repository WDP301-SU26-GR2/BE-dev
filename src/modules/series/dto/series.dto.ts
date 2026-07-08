import { createZodDto } from 'nestjs-zod'
import {
  AddNamePageBodySchema,
  CreateProposalBodySchema,
  CreateProposalResSchema,
  FranchiseConsentBodySchema,
  HiatusBodySchema,
  ListSeriesQuerySchema,
  NameListResSchema,
  NameResSchema,
  ReasonBodySchema,
  SeriesListResSchema,
  SeriesResSchema,
  UpdateNamePagesBodySchema,
  UpdateProposalBodySchema
} from '../schemas/series-schemas'

export class CreateProposalBodyDto extends createZodDto(CreateProposalBodySchema) {}
export class UpdateProposalBodyDto extends createZodDto(UpdateProposalBodySchema) {}
export class ReasonBodyDto extends createZodDto(ReasonBodySchema) {}
export class UpdateNamePagesBodyDto extends createZodDto(UpdateNamePagesBodySchema) {}
export class AddNamePageBodyDto extends createZodDto(AddNamePageBodySchema) {}
export class SeriesResDto extends createZodDto(SeriesResSchema) {}
export class NameResDto extends createZodDto(NameResSchema) {}
export class CreateProposalResDto extends createZodDto(CreateProposalResSchema) {}
export class ListSeriesQueryDto extends createZodDto(ListSeriesQuerySchema) {}
export class SeriesListResDto extends createZodDto(SeriesListResSchema) {}
export class NameListResDto extends createZodDto(NameListResSchema) {}
export class HiatusBodyDto extends createZodDto(HiatusBodySchema) {}
export class FranchiseConsentBodyDto extends createZodDto(FranchiseConsentBodySchema) {}
