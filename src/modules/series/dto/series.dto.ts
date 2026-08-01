import { createZodDto } from 'nestjs-zod'
import {
  CreateProposalBodySchema,
  FranchiseConsentBodySchema,
  HiatusBodySchema,
  ListSeriesQuerySchema,
  ProposeCompletionBodySchema,
  ReasonBodySchema,
  SeriesListResSchema,
  SeriesResSchema,
  UpdateProposalBodySchema,
  UpdateSeriesMetadataBodySchema
} from '../schemas/series-schemas'

export class CreateProposalBodyDto extends createZodDto(CreateProposalBodySchema) {}
export class UpdateProposalBodyDto extends createZodDto(UpdateProposalBodySchema) {}
export class UpdateSeriesMetadataBodyDto extends createZodDto(UpdateSeriesMetadataBodySchema) {}
export class SeriesReasonBodyDto extends createZodDto(ReasonBodySchema) {}
export class SeriesResDto extends createZodDto(SeriesResSchema) {}
export class ListSeriesQueryDto extends createZodDto(ListSeriesQuerySchema) {}
export class SeriesListResDto extends createZodDto(SeriesListResSchema) {}
export class HiatusBodyDto extends createZodDto(HiatusBodySchema) {}
export class FranchiseConsentBodyDto extends createZodDto(FranchiseConsentBodySchema) {}
export class ProposeCompletionBodyDto extends createZodDto(ProposeCompletionBodySchema) {}
