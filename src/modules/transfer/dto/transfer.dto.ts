import { createZodDto } from 'nestjs-zod'
import {
  CreateTransferRequestSchema,
  BoardDecisionTransferSchema,
  CreateTransferContractSchema,
  AssignFullBuyoutSchema,
  SignTransferContractSchema,
  CoOwnerRejectChapterSchema,
  // Thêm các Response Schemas mới import từ file schema của bạn
  TransferRequestSchema,
  TransferRequestListSchema,
  TransferContractSchema,
  TransferSignatureListSchema
} from '../schemas/transfer-schema'

// ==========================================
// 1. REQUEST DTOs
// ==========================================

export class CreateTransferRequestBodyDto extends createZodDto(CreateTransferRequestSchema) {}

export class BoardDecisionTransferBodyDto extends createZodDto(BoardDecisionTransferSchema) {}

export class AssignFullBuyoutBodyDto extends createZodDto(AssignFullBuyoutSchema) {}

export class CreateTransferContractBodyDto extends createZodDto(CreateTransferContractSchema) {}

export class SignTransferContractBodyDto extends createZodDto(SignTransferContractSchema) {}

export class CoOwnerRejectChapterBodyDto extends createZodDto(CoOwnerRejectChapterSchema) {}

// ==========================================
// 2. RESPONSE DTOs
// ==========================================

export class TransferRequestResDto extends createZodDto(TransferRequestSchema) {}

export class TransferRequestListResDto extends createZodDto(TransferRequestListSchema) {}

export class TransferContractResDto extends createZodDto(TransferContractSchema) {}

export class TransferSignatureListResDto extends createZodDto(TransferSignatureListSchema) {}
