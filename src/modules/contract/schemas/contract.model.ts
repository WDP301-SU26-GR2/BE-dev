import { $Enums } from '@prisma/client'
import { extendApi } from '@anatine/zod-openapi'
import { z } from 'zod'

// 🌟 Đồng bộ Enums trực tiếp từ Prisma client (Giữ nguyên cấu trúc sạch của bạn)
export const ContractType = $Enums.ContractType
export type ContractTypeType = $Enums.ContractType

export const ContractStatus = $Enums.ContractStatus
export type ContractStatusType = $Enums.ContractStatus

// 🔥 Base Contract Schema
export const ContractSchema = extendApi(
  z.object({
    id: z.string(),
    seriesId: z.string(),
    mangakaId: z.string(),
    editorId: z.string().nullable(),
    boardDecisionId: z.string().nullable(),
    contractType: z.nativeEnum($Enums.ContractType),
    valuationAmount: z.number().nullable(),
    publisherOwnershipPct: z.number().nullable(),
    mangakaOwnershipPct: z.number().nullable(),
    terminationClause: z.string().nullable(),
    // 🌟 Đổi sang z.coerce.date() để NestJS tự parse string ISO từ JSON sang Date object
    contractStart: z.coerce.date().nullable(),
    contractEnd: z.coerce.date().nullable(),
    status: z.nativeEnum($Enums.ContractStatus),
    mangakaSignedAt: z.coerce.date().nullable(),
    boardSignedAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date()
  }),
  { title: 'Contract', description: 'Core Contract Schema' }
)

// 🔥 Base ContractVersion Schema
export const ContractVersionSchema = extendApi(
  z.object({
    id: z.string(),
    contractId: z.string(),
    versionNumber: z.number(),
    valuationAmount: z.number().nullable(),
    publisherOwnershipPct: z.number().nullable(),
    mangakaOwnershipPct: z.number().nullable(),
    terminationClause: z.string().nullable(),
    editedById: z.string(),
    note: z.string().nullable(),
    createdAt: z.coerce.date()
  }),
  { title: 'ContractVersion', description: 'Contract Version History Schema' }
)

// 🌟 SỬA: Đổi tên Type thành ContractDataType để tránh đè tên với Enum ContractType ở dòng 6
export type ContractDataType = z.infer<typeof ContractSchema>
export type ContractVersionDataType = z.infer<typeof ContractVersionSchema>

// ==========================================
// 🌟 BỔ SUNG: Các Schema DTO phục vụ Tầng API & Repository
// ==========================================

// Schema tạo hợp đồng nháp (Loại bỏ các trường tự sinh hoặc do hệ thống quản lý)
export const CreateContractBodySchema = ContractSchema.omit({
  id: true,
  editorId: true,
  boardDecisionId: true,
  status: true,
  mangakaSignedAt: true,
  boardSignedAt: true,
  createdAt: true,
  updatedAt: true
})
// 🌟 Cung cấp chính xác Type cho hàm createDraft() trong contract.repo.ts
export type CreateContractBodyType = z.infer<typeof CreateContractBodySchema>

// Schema cập nhật điều khoản hợp đồng (Cho phép truyền thiếu các trường)
export const UpdateContractBodySchema = CreateContractBodySchema.partial()
export type UpdateContractBodyType = z.infer<typeof UpdateContractBodySchema>
