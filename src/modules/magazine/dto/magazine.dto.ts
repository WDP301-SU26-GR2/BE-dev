import { createZodDto } from 'nestjs-zod'
import {
  CreateMagazineBodySchema,
  UpdateMagazineBodySchema,
  MagazineEntryResSchema,
  MagazineListResSchema
} from '../schemas/magazine-schemas'

export class CreateMagazineBodyDto extends createZodDto(CreateMagazineBodySchema) {}
export class UpdateMagazineBodyDto extends createZodDto(UpdateMagazineBodySchema) {}
export class MagazineEntryResDto extends createZodDto(MagazineEntryResSchema) {}
export class MagazineListResDto extends createZodDto(MagazineListResSchema) {}
