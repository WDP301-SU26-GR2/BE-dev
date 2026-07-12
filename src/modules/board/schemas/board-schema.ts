import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { $Enums, Genre } from '@prisma/client'
import { BoardDecisionSchema, BoardConfigSchema, SeriesReportSchema } from './board.model'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { zDateField } from 'src/core/http/docs/date-docs'

export const CreateBoardSessionBodySchema = extendApi(
  z
    .object({
      title: z
        .string()
        .min(5, 'Tiêu đề phiên họp phải từ 5 ký tự trở lên.')
        .max(100, 'Tiêu đề phiên họp không được vượt quá 100 ký tự.'),

      startTime: z
        .string()
        .datetime({ message: 'startTime phải là chuỗi định dạng ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)' })
        .refine((value) => new Date(value) > new Date(), {
          message: 'Thời gian bắt đầu phiên họp phải là một thời điểm trong tương lai.'
        })
        .transform((value) => new Date(value)),

      endTime: z
        .string()
        .datetime({ message: 'endTime phải là chuỗi ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)' })
        .transform((value) => new Date(value))
        .optional()
        .describe('Giờ kết thúc dự kiến; bỏ trống = chỉ kết thúc thủ công'),

      description: z.string().max(500, 'Mô tả không được vượt quá 500 ký tự.').optional().nullable(),

      allowedEditorIds: z
        .array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Mã định danh thành viên ban biên tập không hợp lệ.'))
        .min(3, 'Phiên họp bắt buộc phải mời ít nhất 3 thành viên ban biên tập tham gia.')
        .optional()
        .describe('Bỏ trống → hệ thống tự phân công theo seriesId (PB-05)'),

      seriesId: z
        .string()
        .regex(/^[0-9a-fA-F]{24}$/)
        .optional()
        .describe('Nguồn thể loại cho auto-assign roster. BẮT BUỘC khi omit allowedEditorIds'),

      rosterSize: z
        .number()
        .int()
        .min(3)
        .optional()
        .describe('Sĩ số mong muốn (sẽ được ép về số lẻ). Mặc định lấy BoardConfig.quorumMin')
    })
    .refine((value) => !value.endTime || value.endTime > value.startTime, {
      message: 'endTime phải sau startTime.',
      path: ['endTime']
    }),
  { title: 'CreateBoardSessionBody', description: 'Editor tạo phiên họp Hội đồng' }
)
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
    decisionType: zEnum($Enums.DecisionType, 'DecisionType')
  }),
  { title: 'CreateBoardDecisionBody', description: 'Tạo quyết định Hội đồng nháp' }
)

// 2. Schema phục vụ API Board member tiến hành bỏ phiếu (POST /board/decisions/:id/vote)
export const CastVoteBodySchema = extendApi(
  z
    .object({
      // voterId: z.string().min(1, { message: 'voterId định danh người bỏ phiếu là bắt buộc' }),
      voteValue: zEnum($Enums.VoteValue, 'VoteValue'),
      note: z.string().max(300, { message: 'Ghi chú lý do biểu quyết không được quá 300 ký tự' }).optional()
    })
    .strict(),
  { title: 'CastVoteBody', description: 'Board/Editor bỏ phiếu cho quyết định' }
)

// 3. Schema phục vụ API Editor soạn báo cáo phân tích đính kèm cuộc họp (POST /board/reports)
export const CreateSeriesReportBodySchema = extendApi(
  SeriesReportSchema.omit({
    id: true,
    preparedBy: true,
    createdAt: true,
    updatedAt: true
  }).extend({
    seriesId: z.string().min(1, { message: 'seriesId là bắt buộc' }),
    boardDecisionId: z.string().min(1, { message: 'boardDecisionId liên kết cuộc họp là bắt buộc' }),
    content: z.string().min(1, { message: 'Nội dung phân tích số liệu xu hướng bắt buộc phải nhập' })
  }),
  { title: 'CreateSeriesReportBody', description: 'Editor tạo báo cáo phân tích series' }
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
  { title: 'UpdateBoardConfigBody', description: 'Cập nhật cấu hình biểu quyết Hội đồng' }
)

export const BoardVoteResSchema = extendApi(
  z.object({
    voterId: z.string().nullable().optional(),
    voteValue: zEnum($Enums.VoteValue, 'VoteValue').nullable().optional(),
    note: z.string().nullable().optional(),
    votedAt: zDateField()
  }),
  { title: 'BoardVoteRes', description: 'Một phiếu biểu quyết của quyết định Hội đồng' }
)

export const BoardSessionResSchema = extendApi(
  z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    creatorId: z.string(),
    status: zEnum($Enums.BoardSessionStatus, 'BoardSessionStatus'),
    allowedEditorIds: z.array(z.string()),
    startTime: zDateField(),
    endTime: zDateField().nullable().optional(),
    createdAt: zDateField(),
    updatedAt: zDateField()
  }),
  { title: 'BoardSessionRes', description: 'Chi tiết phiên họp Hội đồng' }
)

export const BoardDecisionResSchema = extendApi(
  z.object({
    id: z.string(),
    targetSeriesId: z.string().nullable().optional(),
    boardSessionId: z.string(),
    decisionType: zEnum($Enums.DecisionType, 'DecisionType').nullable().optional(),
    result: zEnum($Enums.BoardDecisionResult, 'BoardDecisionResult').nullable().optional(),
    totalVotes: z.number(),
    approveCount: z.number(),
    rejectCount: z.number(),
    quorumMet: z.boolean(),
    endingChapterAllowance: z.number().nullable().optional(),
    details: z.any().nullable().optional(),
    decidedAt: zDateField().nullable().optional(),
    allowedEditorIds: z.array(z.string()).optional(),
    votes: z.array(BoardVoteResSchema),
    createdAt: zDateField().optional()
  }),
  { title: 'BoardDecisionRes', description: 'Chi tiết quyết định Hội đồng' }
)

export const SeriesReportResSchema = extendApi(
  z.object({
    id: z.string(),
    seriesId: z.string().nullable().optional(),
    boardDecisionId: z.string().nullable().optional(),
    preparedBy: z.string().nullable().optional(),
    reportType: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    attachments: z.array(z.string()),
    createdAt: zDateField()
  }),
  { title: 'SeriesReportRes', description: 'Chi tiết báo cáo Hội đồng' }
)

export const BoardConfigResSchema = extendApi(
  z.object({
    id: z.string(),
    updatedBy: z.string().nullable().optional(),
    boardTotalMembers: z.number(),
    quorumMin: z.number(),
    approveMajorityRatio: z.number(),
    isDefault: z.boolean().optional(),
    updatedAt: zDateField()
  }),
  { title: 'BoardConfigRes', description: 'Cấu hình biểu quyết Hội đồng' }
)

export const BoardVoteListResSchema = extendApi(
  z.object({
    data: z.array(BoardVoteResSchema)
  }),
  { title: 'BoardVoteListRes', description: 'Danh sách phiếu biểu quyết' }
)

// ================= SuggestBoardMembers (PB-05) =================
export const SuggestBoardMembersQuerySchema = extendApi(
  z
    .object({
      seriesId: z.string().regex(/^[0-9a-fA-F]{24}$/),
      size: z.coerce.number().int().min(3).optional()
    })
    .strict(),
  { title: 'SuggestBoardMembersQuery', description: 'Gợi ý roster Board theo thể loại của series (PB-05)' }
)

export const SuggestBoardMembersResSchema = extendApi(
  z.object({
    items: z.array(
      z.object({
        userId: z.string(),
        displayName: z.string().nullable(),
        avatar: z.string().nullable(),
        specialtyGenres: z.array(zEnum(Genre, 'Genre')),
        matchedGenres: z.array(zEnum(Genre, 'Genre')).describe('Giao giữa sở trường và thể loại của series'),
        score: z.number().describe('Số thể loại khớp'),
        hasProfile: z.boolean()
      })
    ),
    size: z.number().describe('Sĩ số roster đề xuất — LUÔN lẻ và >= 3')
  }),
  { title: 'SuggestBoardMembersRes', description: 'Roster đề xuất, đã xếp hạng' }
)
