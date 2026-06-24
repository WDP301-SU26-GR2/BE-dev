import { createZodDto } from 'nestjs-zod'
import {
  CreateContractBodySchema,
  EditorUpdateContractBodySchema,
  SignContractWithOtpBodySchema
} from '../schemas/contract-schema'

export class CreateContractBodyDto extends createZodDto(CreateContractBodySchema) {}
export class EditorUpdateContractBodyDto extends createZodDto(EditorUpdateContractBodySchema) {}
export class SignContractWithOtpBodyDto extends createZodDto(SignContractWithOtpBodySchema) {}
