import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { $Enums } from '@prisma/client'
import { BoardDecisionSchema, BoardConfigSchema, SeriesReportSchema } from './board.model'

// 1. Schema phục vụ API tạo cuộc họp biểu quyết mới (POST /board/decisions)
export const CreateBoardDecisionBodySchema = extendApi(
  BoardDecisionSchema.omit({
    id: true,
    result: true,
    votes: true,
    approveCount: true,
    rejectCount: true,
    totalVotes: true,
    quorumMet: true,
    endingChapterAllowance: true,
    decidedAt: true,
    createdAt: true,
    updatedAt: true
  }).extend({
    boardSessionId: z
      .string({ error: 'boardSessionId phải là chuỗi ký tự' })
      .min(1, { message: 'boardSessionId là bắt buộc không được để trống' }),
    decisionType: z.nativeEnum($Enums.DecisionType, {
      error: 'decisionType phải là một giá trị hợp lệ trong Hệ thống Enum'
    })
  }),
  { title: 'CreateBoardDecisionBody', description: 'Cấu trúc tạo quyết định họp hội đồng nháp' }
)

// 2. Schema phục vụ API Board member tiến hành bỏ phiếu (POST /board/decisions/:id/vote)
export const CastVoteBodySchema = extendApi(
  z
    .object({
      voterId: z.string().min(1, { message: 'voterId định danh người bỏ phiếu là bắt buộc' }),
      voteValue: z.enum(['APPROVE', 'REJECT', 'ABSTAIN'], {
        error: 'voteValue bắt buộc phải thuộc nhóm: APPROVE, REJECT, ABSTAIN'
      }),
      note: z.string().max(300, { message: 'Ghi chú lý do biểu quyết không được quá 300 ký tự' }).optional()
    })
    .strict(),
  { title: 'CastVoteBody', description: 'Payload thực hiện quyền biểu quyết của đại biểu' }
)

// 3. Schema phục vụ API Editor soạn báo cáo phân tích đính kèm cuộc họp (POST /board/reports)
export const CreateSeriesReportBodySchema = extendApi(
  SeriesReportSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true
  }).extend({
    seriesId: z.string().min(1, { message: 'seriesId là bắt buộc' }),
    boardDecisionId: z.string().min(1, { message: 'boardDecisionId liên kết cuộc họp là bắt buộc' }),
    content: z.string().min(1, { message: 'Nội dung phân tích số liệu xu hướng bắt buộc phải nhập' })
  }),
  { title: 'CreateSeriesReportBody', description: 'Payload đính kèm báo cáo phân tích từ Editor' }
)

// 4. Schema phục vụ API Admin điều chỉnh tham số cấu hình cuộc họp (PUT /board/config/:id)
export const UpdateBoardConfigBodySchema = extendApi(
  BoardConfigSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true
  })
    .strict()
    .superRefine(({ boardTotalMembers, quorumMin }, ctx) => {
      if (boardTotalMembers % 2 === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'Sĩ số tổng của Board thành viên bắt buộc phải là số lẻ để tránh tình huống hòa phiếu',
          path: ['boardTotalMembers']
        })
      }

      if (quorumMin > boardTotalMembers) {
        ctx.addIssue({
          code: 'custom',
          message: 'Số thành viên tham gia họp tối thiểu (Quorum) không được vượt quá tổng sĩ số ban đại biểu',
          path: ['quorumMin']
        })
      }
    }),
  { title: 'UpdateBoardConfigBody', description: 'Cấu hình tham số điều lệ biểu quyết nội bộ' }
)
