import { createZodDto } from 'nestjs-zod'
import {
  CreateContractBodySchema,
  EditorUpdateContractBodySchema,
  SignContractWithOtpBodySchema,
  ReportRevenueBodySchema,
  ContractResSchema,
  ContractVersionResSchema,
  ContractHealthResSchema,
  ContractSignResSchema,
  ContractStatusProgressResSchema
} from '../schemas/contract-schema'

export class CreateContractBodyDto extends createZodDto(CreateContractBodySchema) {}
export class EditorUpdateContractBodyDto extends createZodDto(EditorUpdateContractBodySchema) {}
export class SignContractWithOtpBodyDto extends createZodDto(SignContractWithOtpBodySchema) {}
export class ReportRevenueBodyDto extends createZodDto(ReportRevenueBodySchema) {}
export class ContractResDto extends createZodDto(ContractResSchema) {}
export class ContractVersionResDto extends createZodDto(ContractVersionResSchema) {}
export class ContractHealthResDto extends createZodDto(ContractHealthResSchema) {}
export class ContractSignResDto extends createZodDto(ContractSignResSchema) {}
export class ContractStatusProgressResDto extends createZodDto(ContractStatusProgressResSchema) {}
