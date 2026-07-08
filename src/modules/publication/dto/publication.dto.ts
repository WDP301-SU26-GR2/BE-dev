import { createZodDto } from 'nestjs-zod'
import {
  CreatePublicationVersionSchema,
  PublicationVersionListResSchema,
  PublicationVersionResSchema,
  UpdatePublicationVersionSchema
} from '../schemas/publication-schemas'

export class CreatePublicationVersionBodyDto extends createZodDto(CreatePublicationVersionSchema) {}
export class UpdatePublicationVersionBodyDto extends createZodDto(UpdatePublicationVersionSchema) {}
export class PublicationVersionResDto extends createZodDto(PublicationVersionResSchema) {}
export class PublicationVersionListResDto extends createZodDto(PublicationVersionListResSchema) {}
