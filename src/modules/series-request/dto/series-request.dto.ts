import { createZodDto } from 'nestjs-zod'
import {
  AcceptSeriesRequestBodySchema,
  CreateSeriesRequestBodySchema,
  ListSeriesRequestQuerySchema,
  RejectSeriesRequestBodySchema,
  SeriesRequestListResSchema,
  SeriesRequestResSchema
} from '../schemas/series-request-schemas'

export class CreateSeriesRequestBodyDto extends createZodDto(CreateSeriesRequestBodySchema) {}
export class AcceptSeriesRequestBodyDto extends createZodDto(AcceptSeriesRequestBodySchema) {}
export class RejectSeriesRequestBodyDto extends createZodDto(RejectSeriesRequestBodySchema) {}
export class ListSeriesRequestQueryDto extends createZodDto(ListSeriesRequestQuerySchema) {}
export class SeriesRequestResDto extends createZodDto(SeriesRequestResSchema) {}
export class SeriesRequestListResDto extends createZodDto(SeriesRequestListResSchema) {}
