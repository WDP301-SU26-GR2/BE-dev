import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { $Enums, Genre } from '@prisma/client'
import { BoardDecisionSchema, BoardConfigSchema, SeriesReportSchema } from './board.model'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { zDateField } from 'src/core/http/docs/date-docs'
import { UserMiniSchema } from 'src/core/models/user-mini.model'

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
  })
    .extend({
      boardSessionId: z
        .string({ error: 'boardSessionId phải là chuỗi ký tự' })
        .min(1, { message: 'boardSessionId là bắt buộc không được để trống' }),
      decisionType: zEnum($Enums.DecisionType, 'DecisionType')
    })
    .superRefine((value, ctx) => {
      if (value.decisionType === $Enums.DecisionType.SERIALIZATION) {
        const details = (value.details ?? {}) as Record<string, unknown>
        if (typeof details.magazine !== 'string' || details.magazine.trim() === '') {
          ctx.addIssue({
            code: 'custom',
            path: ['details', 'magazine'],
            message: 'magazine là bắt buộc cho decision SERIALIZATION'
          })
        }
        if (
          typeof details.startIssueNumber !== 'number' ||
          !Number.isInteger(details.startIssueNumber) ||
          details.startIssueNumber <= 0
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['details', 'startIssueNumber'],
            message: 'startIssueNumber phải là số nguyên > 0'
          })
        }
        if (
          details.publicationType !== 'WEEKLY' &&
          details.publicationType !== 'MONTHLY' &&
          details.publicationType !== 'IRREGULAR'
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['details', 'publicationType'],
            message: 'publicationType phải là WEEKLY | MONTHLY | IRREGULAR'
          })
        }
      }

      if (value.decisionType === $Enums.DecisionType.CANCELLATION) {
        const details = (value.details ?? {}) as Record<string, unknown>
        const allowance = details.endingChapterAllowance
        if (
          allowance !== undefined &&
          (typeof allowance !== 'number' || !Number.isInteger(allowance) || allowance < 1 || allowance > 10)
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['details', 'endingChapterAllowance'],
            message: 'endingChapterAllowance phải là số nguyên 1..10 (Requiment 1.11)'
          })
        }
      }
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
    .extend({
      quorumMin: z.number().describe('Sĩ số roster mặc định khi auto-assign; KHÔNG phải quorum đếm phiếu')
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
          message: 'Sĩ số roster mặc định khi auto-assign không được vượt quá tổng sĩ số ban đại biểu',
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
    phase: zEnum($Enums.BoardSessionPhase, 'BoardSessionPhase'),
    creator: UserMiniSchema.optional().describe('CÓ ở GET /board/sessions + GET /board/sessions/:id (enrich)'),
    members: z.array(UserMiniSchema).optional().describe('Resolve từ allowedEditorIds — CÓ ở list + detail'),
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
    targetSeries: z
      .object({ id: z.string(), title: z.string() })
      .nullable()
      .optional()
      .describe('CÓ ở GET /board/decisions + /:id (enrich); null nếu decision không gắn series'),
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
    quorumMin: z.number().describe('Sĩ số roster mặc định khi auto-assign; KHÔNG phải quorum đếm phiếu'),
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

export const AdvancePhaseBodySchema = extendApi(
  z.object({ phase: zEnum($Enums.BoardSessionPhase, 'BoardSessionPhase') }).strict(),
  { title: 'AdvancePhaseBody', description: 'Chuyển giai đoạn phiên họp — forward-only, cho nhảy cóc' }
)

export const ListBoardSessionsQuerySchema = extendApi(
  z
    .object({
      mine: z
        .enum(['true', 'false'])
        .optional()
        .transform((value) => (value === undefined ? undefined : value === 'true'))
        .describe("'true' = chỉ phiên caller là creator hoặc trong roster"),
      status: zEnum($Enums.BoardSessionStatus, 'BoardSessionStatus').optional()
    })
    .strict(),
  { title: 'ListBoardSessionsQuery', description: 'Filter danh sách phiên họp' }
)

export const ListBoardDecisionsQuerySchema = extendApi(
  z
    .object({
      boardSessionId: z.string().optional().describe('Lọc decision theo phiên họp'),
      targetSeriesId: z.string().optional().describe('Lọc decision theo series mục tiêu')
    })
    .strict(),
  { title: 'ListBoardDecisionsQuery', description: 'Filter danh sách quyết định' }
)

export const ListBoardReportsQuerySchema = extendApi(
  z
    .object({
      seriesId: z.string().optional().describe('Toàn bộ report của series — dùng khi mở phiên mới'),
      boardDecisionId: z.string().optional()
    })
    .strict(),
  { title: 'ListBoardReportsQuery', description: 'Filter báo cáo Hội đồng' }
)

export const ListBoardMessagesQuerySchema = extendApi(
  z
    .object({
      limit: z.coerce.number().int().positive().max(200).default(50),
      offset: z.coerce.number().int().nonnegative().default(0)
    })
    .strict(),
  { title: 'ListBoardMessagesQuery', description: 'Phân trang lịch sử chat phiên họp' }
)

export const BoardMessageResSchema = extendApi(
  z.object({
    id: z.string(),
    sessionId: z.string(),
    sender: UserMiniSchema,
    content: z.string(),
    phase: zEnum($Enums.BoardSessionPhase, 'BoardSessionPhase').describe('Phase lúc tin nhắn được gửi'),
    createdAt: zDateField()
  }),
  { title: 'BoardMessageRes', description: 'Tin nhắn Q&A trong phiên họp Board' }
)

export const BoardMessageListResSchema = extendApi(
  z.object({ items: z.array(BoardMessageResSchema), total: z.number().int() }),
  { title: 'BoardMessageListRes', description: 'Lịch sử chat phiên họp (phân trang)' }
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
