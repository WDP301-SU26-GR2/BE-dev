import { createZodDto } from 'nestjs-zod'
import {
  SignDownloadBodySchema,
  SignDownloadResSchema,
  SignUploadBodySchema,
  SignUploadResSchema
} from '../schemas/storage-schemas'

export class SignUploadBodyDto extends createZodDto(SignUploadBodySchema) {}
export class SignUploadResDto extends createZodDto(SignUploadResSchema) {}
export class SignDownloadBodyDto extends createZodDto(SignDownloadBodySchema) {}
export class SignDownloadResDto extends createZodDto(SignDownloadResSchema) {}
