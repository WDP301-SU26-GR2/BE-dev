// ⚠ FILE NÀY LÀ *ENTITY/DATA SCHEMA NỘI BỘ*, KHÔNG PHẢI DTO.
// Mục đích: (1) z.infer ra BoardDecisionDataType / VoteDataType cho repo+service — Prisma trả `Date`
//           nên field date PHẢI là z.coerce.date();
//           (2) làm base .omit(...) cho Body schema — và MỌI field date đều bị omit.
// Res schema khai riêng ở board-schema.ts. => KHÔNG đổi z.coerce.date() thành z.string() ở đây
// (sẽ sai type toàn bộ repo/service). Xem AGENTS §10 "Ngoại lệ hợp lệ".

import { $Enums } from '@prisma/client'
import { extendApi } from '@anatine/zod-openapi'
import { z } from 'zod'

// 🌟 Đồng bộ Enum DecisionType
export const DecisionType = $Enums.DecisionType
export type DecisionTypeType = $Enums.DecisionType

// 🌟 Đồng bộ Enum BoardDecisionResult từ Prisma (single source of truth)
export const BoardDecisionResult = $Enums.BoardDecisionResult
export type BoardDecisionResultType = $Enums.BoardDecisionResult

// 🔥 Base Vote Schema (Mảng đối tượng nhúng trong MongoDB)
export const VoteSchema = extendApi(
  z.object({
    voterId: z.string(),
    voteValue: z.nativeEnum($Enums.VoteValue),
    note: z.string().nullable(),
    votedAt: z.coerce.date()
  }),
  { title: 'Vote', description: 'Một phiếu biểu quyết của quyết định Hội đồng' }
)

// 🔥 Base BoardDecision Schema
export const BoardDecisionSchema = extendApi(
  z.object({
    id: z.string(),
    boardSessionId: z.string(),
    targetSeriesId: z.string().nullable(),
    decisionType: z.nativeEnum($Enums.DecisionType),
    details: z.record(z.string(), z.any()).nullable(),
    result: z.nativeEnum($Enums.BoardDecisionResult),
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
  { title: 'BoardDecision', description: 'Quyết định biểu quyết của Hội đồng' }
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
  { title: 'SeriesReport', description: 'Báo cáo phân tích series từ Editor' }
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
  { title: 'BoardConfig', description: 'Cấu hình biểu quyết Hội đồng' }
)

export type VoteDataType = z.infer<typeof VoteSchema>
export type BoardDecisionDataType = z.infer<typeof BoardDecisionSchema>
export type SeriesReportDataType = z.infer<typeof SeriesReportSchema>
export type BoardConfigDataType = z.infer<typeof BoardConfigSchema>
