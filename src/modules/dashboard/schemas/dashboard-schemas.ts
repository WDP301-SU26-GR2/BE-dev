import { $Enums } from '@prisma/client'
import { extendApi } from '@anatine/zod-openapi'
import { z } from 'zod'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { StudioOverviewItemSchema } from 'src/modules/chapter/schemas/chapter-schemas'
import { AdminStatsResSchema } from 'src/modules/users/schemas/users-schemas'

// Ranking mới nhất của 1 series thuộc Mangaka (1 record/series — kỳ gần nhất).
export const DashboardRankingItemSchema = z.object({
  seriesId: z.string(),
  seriesTitle: z.string(),
  seriesStatus: zEnum($Enums.SeriesStatus, 'SeriesStatus'),
  rankPosition: z.number().nullable().describe('null nếu kỳ đó chưa xếp hạng series này'),
  voteCount: z.number(),
  previousRank: z.number().nullable(),
  rankChange: z.number().nullable().describe('+ tăng hạng, - tụt hạng so với kỳ trước'),
  riskLevel: zEnum($Enums.RiskLevel, 'RiskLevel'),
  isAtRisk: z.boolean(),
  recordedAt: z.string().describe('ISO 8601 — thời điểm chốt ranking kỳ gần nhất')
})

export const MangakaDashboardResSchema = extendApi(
  z.object({
    studio: z.array(StudioOverviewItemSchema).describe('Chapter đang sản xuất, sắp theo mức cảnh báo deadline'),
    rankings: z.array(DashboardRankingItemSchema).describe('Ranking kỳ gần nhất của từng series thuộc Mangaka'),
    unreadNotifications: z.number().describe('Số thông báo chưa đọc (badge)'),
    openRevisionRequests: z.number().describe('Số vòng yêu cầu sửa còn mở mà Mangaka phải xử lý')
  }),
  { title: 'MangakaDashboardRes', description: 'Dashboard tổng hợp cho Mangaka (studio + ranking + badge)' }
)

const CountAmountSchema = z.object({ count: z.number(), amount: z.number() })

export const MangakaEarningsResSchema = extendApi(
  z.object({
    totalPaid: z.number(),
    totalPending: z.number(),
    totalMissed: z.number(),
    byStatus: z.record(zEnum($Enums.PaymentRecordStatus, 'PaymentRecordStatus'), CountAmountSchema),
    byType: z.record(zEnum($Enums.PaymentType, 'PaymentType'), CountAmountSchema),
    recent: z.array(
      z.object({
        id: z.string().describe('PaymentRecord ObjectId'),
        amount: z.number(),
        status: zEnum($Enums.PaymentRecordStatus, 'PaymentRecordStatus'),
        paymentType: zEnum($Enums.PaymentType, 'PaymentType'),
        seriesId: z.string().nullable().describe('Series ObjectId; null nếu khoản chi không gắn trực tiếp với series'),
        period: z.string().nullable().describe('Kỳ thanh toán nghiệp vụ; null nếu loại khoản chi không theo kỳ'),
        paidAt: z.string().nullable().describe('ISO 8601; null khi khoản chi chưa được thanh toán'),
        createdAt: z.string().describe('ISO 8601')
      })
    )
  }),
  { title: 'MangakaEarningsRes', description: 'Thu nhập Mangaka tổng hợp từ PaymentRecord' }
)

export const AssistantDashboardResSchema = extendApi(
  z.object({
    tasks: z.object({
      byStatus: z.record(zEnum($Enums.TaskStatus, 'TaskStatus'), z.number()),
      openTotal: z.number()
    }),
    activeAssignments: z.number(),
    reputation: z.object({
      ratingAvg: z.number(),
      ratingCount: z.number(),
      reputationScore: z.number(),
      isRecommended: z.boolean()
    }),
    unreadNotifications: z.number()
  }),
  { title: 'AssistantDashboardRes', description: 'Dashboard Assistant' }
)

export const EditorAtRiskItemSchema = z.object({
  seriesId: z.string().describe('Series ObjectId'),
  title: z.string(),
  riskLevel: zEnum($Enums.RiskLevel, 'RiskLevel'),
  rankPosition: z.number().nullable().describe('null nếu kỳ ranking gần nhất chưa xếp hạng series')
})

export const EditorPendingContractSchema = z.object({
  contractId: z.string().describe('Contract ObjectId'),
  seriesId: z.string().describe('Series ObjectId của hợp đồng'),
  status: zEnum($Enums.ContractStatus, 'ContractStatus')
})

export const EditorDashboardResSchema = extendApi(
  z.object({
    reviewQueue: z.number(),
    mySeries: z.object({
      byStatus: z.record(zEnum($Enums.SeriesStatus, 'SeriesStatus'), z.number()),
      total: z.number()
    }),
    atRisk: z.array(EditorAtRiskItemSchema),
    productionAlerts: z.array(StudioOverviewItemSchema),
    pendingContracts: z.array(EditorPendingContractSchema),
    unreadNotifications: z.number()
  }),
  { title: 'EditorDashboardRes', description: 'Dashboard Editor' }
)

export const BoardPendingDecisionSchema = z.object({
  decisionId: z.string().describe('BoardDecision ObjectId'),
  boardSessionId: z.string().describe('BoardSession ObjectId đang ACTIVE'),
  decisionType: zEnum($Enums.DecisionType, 'DecisionType'),
  targetSeries: z
    .object({ id: z.string().describe('Series ObjectId'), title: z.string() })
    .nullable()
    .describe('Series được đưa ra quyết định; null nếu quyết định không nhắm tới một series'),
  phase: zEnum($Enums.BoardSessionPhase, 'BoardSessionPhase'),
  result: zEnum($Enums.BoardDecisionResult, 'BoardDecisionResult')
})

export const BoardSevereItemSchema = z.object({
  seriesId: z.string().describe('Series ObjectId'),
  title: z.string(),
  rankPosition: z.number().nullable().describe('null nếu kỳ ranking gần nhất chưa xếp hạng series')
})

export const BoardDashboardResSchema = extendApi(
  z.object({
    pendingDecisions: z.array(BoardPendingDecisionSchema),
    upcomingSessions: z.number(),
    atRiskSevere: z.array(BoardSevereItemSchema),
    unreadNotifications: z.number()
  }),
  { title: 'BoardDashboardRes', description: 'Dashboard Board' }
)

export const AdminDashboardResSchema = extendApi(
  z.object({
    systemStats: AdminStatsResSchema,
    unreadNotifications: z.number()
  }),
  { title: 'AdminDashboardRes', description: 'Dashboard Super Admin' }
)

export type MangakaDashboardResType = z.infer<typeof MangakaDashboardResSchema>
export type DashboardRankingItemType = z.infer<typeof DashboardRankingItemSchema>
export type MangakaEarningsResType = z.infer<typeof MangakaEarningsResSchema>
export type AssistantDashboardResType = z.infer<typeof AssistantDashboardResSchema>
export type EditorDashboardResType = z.infer<typeof EditorDashboardResSchema>
export type BoardDashboardResType = z.infer<typeof BoardDashboardResSchema>
export type AdminDashboardResType = z.infer<typeof AdminDashboardResSchema>
