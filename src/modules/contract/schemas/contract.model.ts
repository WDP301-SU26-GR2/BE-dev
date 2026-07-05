import { $Enums } from '@prisma/client'
import { extendApi } from '@anatine/zod-openapi'
import { z } from 'zod'

export const ContractType = $Enums.ContractType
export type ContractTypeType = $Enums.ContractType

export const ContractStatus = $Enums.ContractStatus
export type ContractStatusType = $Enums.ContractStatus

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
    contractStart: z.coerce.date().nullable(),
    contractEnd: z.coerce.date().nullable(),
    status: z.nativeEnum($Enums.ContractStatus),
    mangakaSignedAt: z.coerce.date().nullable(),
    boardSignedAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date()
  }),
  { title: 'Contract', description: 'Hợp đồng xuất bản của series' }
)

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
  { title: 'ContractVersion', description: 'Một phiên bản lịch sử của hợp đồng' }
)

export type ContractDataType = z.infer<typeof ContractSchema>
export type ContractVersionDataType = z.infer<typeof ContractVersionSchema>

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
export type CreateContractBodyType = z.infer<typeof CreateContractBodySchema>

export const UpdateContractBodySchema = CreateContractBodySchema.partial()
export type UpdateContractBodyType = z.infer<typeof UpdateContractBodySchema>
