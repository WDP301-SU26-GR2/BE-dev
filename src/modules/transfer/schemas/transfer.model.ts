import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { $Enums } from '@prisma/client'
import { TRANSFER_REQUEST_STATUS, CO_OWNER_APPROVAL_STATUS } from '../transfer.constant'

// 1. Schema cho TransferContractSignature (Nguồn chữ ký duy nhất)
export const TransferContractSignatureSchema = extendApi(
  z.object({
    id: z.string(),
    transferContractId: z.string(),
    userId: z.string(),
    role: z.string(), // "MANGAKA_A" | "MANGAKA_B" | "BOARD"
    signedAt: z.coerce.date()
  }),
  { title: 'TransferContractSignature', description: 'Chi tiết chữ ký số của các bên trong hợp đồng chuyển nhượng' }
)

// 2. Schema cho TransferContract (Hợp đồng 3 bên)
export const TransferContractModelSchema = extendApi(
  z.object({
    id: z.string(),
    transferRequestId: z.string().nullable(),
    seriesId: z.string().nullable(),
    fromMangakaId: z.string().nullable(),
    toMangakaId: z.string().nullable(),
    transferType: z.nativeEnum($Enums.TransferType).nullable(),
    transferAmount: z.number().nullable(),
    newOwnershipSplit: z.any().nullable(), // Lưu cấu trúc Json chia tỷ lệ doanh thu mới
    coOwnerApprovalRequired: z.boolean().default(false),
    status: z.nativeEnum($Enums.TransferContractStatus),
    createdAt: z.coerce.date()
  }),
  { title: 'TransferContractModel', description: 'Hợp đồng chuyển nhượng 3 bên phản ánh điều khoản thương lượng' }
)

// 3. Schema cho TransferRequest (Yêu cầu chuyển nhượng)
export const TransferRequestModelSchema = extendApi(
  z.object({
    id: z.string(),
    seriesId: z.string(),
    requestingMangakaId: z.string(),
    originalMangakaId: z.string(),
    originalContractType: z.string().nullable(),
    proposedType: z.nativeEnum($Enums.TransferType).nullable(),
    proposedPercentage: z.number().nullable(),
    planDescription: z.string().nullable(),
    status: z.nativeEnum(TRANSFER_REQUEST_STATUS),
    boardDecisionId: z.string().nullable(),
    originalContractId: z.string().nullable(),
    createdAt: z.coerce.date()
  }),
  { title: 'TransferRequestModel', description: 'Hồ sơ yêu cầu chuyển nhượng do Mangaka B nộp lên' }
)

// 4. Schema cho ChapterCoOwnerApproval (Bản ghi hook duyệt độc lập cho Co-owner)
export const ChapterCoOwnerApprovalSchema = extendApi(
  z.object({
    id: z.string(),
    chapterId: z.string(),
    status: z.nativeEnum(CO_OWNER_APPROVAL_STATUS),
    coOwnerId: z.string().nullable(),
    decisionAt: z.coerce.date().nullable(),
    rejectReason: z.string().nullable(),
    deadline: z.coerce.date().nullable(),
    escalatedAt: z.coerce.date().nullable(),
    escalatedToId: z.string().nullable(),
    createdAt: z.coerce.date()
  }),
  { title: 'ChapterCoOwnerApproval', description: 'Bản ghi theo dõi tiến độ phê duyệt chương truyện của đồng sở hữu' }
)

export type TransferContractSignatureType = z.infer<typeof TransferContractSignatureSchema>
export type TransferContractModelType = z.infer<typeof TransferContractModelSchema>
export type TransferRequestModelType = z.infer<typeof TransferRequestModelSchema>
export type ChapterCoOwnerApprovalType = z.infer<typeof ChapterCoOwnerApprovalSchema>
