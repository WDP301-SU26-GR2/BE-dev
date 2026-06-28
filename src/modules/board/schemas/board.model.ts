import { $Enums } from '@prisma/client'
import { extendApi } from '@anatine/zod-openapi'
import { z } from 'zod'

// 🌟 Đồng bộ Enum DecisionType
export const DecisionType = $Enums.DecisionType
export type DecisionTypeType = $Enums.DecisionType

// 🔥 TỰ ĐỊNH NGHĨA: Trạng thái kết quả của Quyết định
export const BoardDecisionResult = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'PENDING_QUORUM'])
export type BoardDecisionResultType = z.infer<typeof BoardDecisionResult>

// 🔥 TỰ ĐỊNH NGHĨA: Trạng thái của một Phiên họp Hội đồng
export const BoardSessionStatus = $Enums.BoardSessionStatus
export type BoardSessionStatusType = z.infer<typeof BoardSessionStatus>

// 🔥 Base Vote Schema (Mảng đối tượng nhúng trong MongoDB)
export const VoteSchema = extendApi(
  z.object({
    voterId: z.string(),
    voteValue: z.enum(['APPROVE', 'REJECT', 'ABSTAIN']),
    note: z.string().nullable(),
    votedAt: z.coerce.date()
  }),
  { title: 'Vote', description: 'Cấu trúc đối tượng phiếu bầu nhúng trong Decision' }
)

// 🔥 Base BoardSession Schema (Bổ sung mới)
export const BoardSessionSchema = extendApi(
  z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    creatorId: z.string(),
    status: BoardSessionStatus,
    allowedEditorIds: z.array(z.string()),
    startTime: z.coerce.date(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date()
  }),
  { title: 'BoardSession', description: 'Gốc thực thể phiên họp Hội đồng tổng' }
)

// 🔥 Base BoardDecision Schema
export const BoardDecisionSchema = extendApi(
  z.object({
    id: z.string(),
    boardSessionId: z.string(),
    targetSeriesId: z.string().nullable(),
    decisionType: z.nativeEnum($Enums.DecisionType),
    details: z.record(z.string(), z.any()).nullable(),
    result: BoardDecisionResult,
    votes: z.array(VoteSchema),
    approveCount: z.number(),
    rejectCount: z.number(),
    totalVotes: z.number(),
    quorumMet: z.boolean(),
    endingChapterAllowance: z.number().nullable(),
    decidedAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date()
  }),
  { title: 'BoardDecision', description: 'Core Board Decision Schema' }
)

// 🔥 Base SeriesReport Schema
export const SeriesReportSchema = extendApi(
  z.object({
    id: z.string(),
    seriesId: z.string(),
    boardDecisionId: z.string(),
    preparedBy: z.string(),
    reportType: z.string(),
    content: z.string(),
    attachments: z.array(z.string()),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date()
  }),
  { title: 'SeriesReport', description: 'Core Series Report Schema từ Editor' }
)

// 🔥 Base BoardConfig Schema
export const BoardConfigSchema = extendApi(
  z.object({
    id: z.string(),
    boardTotalMembers: z.number(),
    quorumMin: z.number(),
    approveMajorityRatio: z.number(),
    updatedBy: z.string(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date()
  }),
  { title: 'BoardConfig', description: 'Core Board Configuration Schema' }
)

export type VoteDataType = z.infer<typeof VoteSchema>
export type BoardSessionDataType = z.infer<typeof BoardSessionSchema> // 🌟 Bổ sung mới
export type BoardDecisionDataType = z.infer<typeof BoardDecisionSchema>
export type SeriesReportDataType = z.infer<typeof SeriesReportSchema>
export type BoardConfigDataType = z.infer<typeof BoardConfigSchema>
