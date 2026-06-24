import { $Enums } from '@prisma/client'
import { extendApi } from '@anatine/zod-openapi'
import { z } from 'zod'

// Đồng bộ Enums trực tiếp từ Prisma client tương tự cách làm bên User model
export const ContractType = $Enums.ContractType
export type ContractTypeType = $Enums.ContractType

export const ContractStatus = $Enums.ContractStatus
export type ContractStatusType = $Enums.ContractStatus

// Base Contract Schema
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
    contractStart: z.date().nullable(),
    contractEnd: z.date().nullable(),
    status: z.nativeEnum($Enums.ContractStatus),
    mangakaSignedAt: z.date().nullable(),
    boardSignedAt: z.date().nullable(),
    createdAt: z.date(),
    updatedAt: z.date()
  }),
  { title: 'Contract', description: 'Core Contract Schema' }
)

// Base ContractVersion Schema
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
    createdAt: z.date()
  }),
  { title: 'ContractVersion', description: 'Contract Version History Schema' }
)

export type ContractType = z.infer<typeof ContractSchema>
export type ContractVersionType = z.infer<typeof ContractVersionSchema>
