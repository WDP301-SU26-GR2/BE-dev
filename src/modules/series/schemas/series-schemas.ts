import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import {
  Demographic,
  FranchiseConsentStatus,
  Genre,
  ProposalStatus,
  PublicationType,
  RelationshipType,
  RoleCode,
  SeriesStatus
} from '@prisma/client'
import { zEnum, zEnumString } from 'src/core/http/docs/enum-docs'
import { UserMiniSchema } from 'src/core/models/user-mini.model'

export const StoryboardPageSchema = z
  .object({ pageNumber: z.number().int().min(1), fileUrl: z.string().min(1) })
  .strict()

export const CreateProposalBodySchema = extendApi(
  z
    .object({
      title: z.string().min(1).max(200),
      coverImage: z.string().min(1).optional(),
      genres: z.array(zEnum(Genre, 'Genre')).default([]),
      demographic: zEnum(Demographic, 'Demographic').optional(),
      publicationType: zEnum(PublicationType, 'PublicationType').optional(),
      synopsis: z.string().max(5000).optional(),
      characterDesigns: z.array(z.string()).default([]),
      estimatedLength: z.number().int().min(1).optional(),
      storyboardPages: z.array(StoryboardPageSchema).default([]),
      parentSeriesId: z.string().optional(),
      relationshipType: zEnum(RelationshipType, 'RelationshipType').optional()
    })
    .strict(),
  { title: 'CreateProposalBody', description: 'Tạo proposal + trang phác thảo nộp kèm' }
)

export const UpdateProposalBodySchema = extendApi(
  z
    .object({
      title: z.string().min(1).max(200).nullish(),
      coverImage: z.string().min(1).nullish(),
      genres: z.array(zEnum(Genre, 'Genre')).nullish(),
      demographic: zEnum(Demographic, 'Demographic').nullish(),
      publicationType: zEnum(PublicationType, 'PublicationType').nullish(),
      synopsis: z.string().max(5000).nullish(),
      characterDesigns: z.array(z.string()).nullish(),
      estimatedLength: z.number().int().min(1).nullish(),
      storyboardPages: z.array(StoryboardPageSchema).nullish()
    })
    .strict(),
  { title: 'UpdateProposalBody', description: 'Sửa proposal (DRAFT/PROPOSAL_REVISION) - gửi field nào sửa field đó' }
)

// Spec 14 §2: metadata trình bày có thể sửa ở mọi giai đoạn trừ khi series đã kết thúc.
// Concept/roster fields (genres/demographic) và Board-owned slot fields intentionally không có trong
// schema; `.strict()` khiến client gửi các field ngoài allowlist nhận 422.
export const UpdateSeriesMetadataBodySchema = extendApi(
  z
    .object({
      title: z.string().min(1).max(200).optional(),
      coverImage: z.string().nullish().describe("Object key A7; '' = xoá ảnh bìa"),
      synopsis: z.string().max(5000).nullish().describe("'' = xoá synopsis"),
      characterDesigns: z.array(z.string()).nullish().describe('Object key A7; [] = xoá hết')
    })
    .strict(),
  {
    title: 'UpdateSeriesMetadataBody',
    description: 'PATCH metadata series — omit/null = giữ nguyên, "" = clear, [] = clear mảng'
  }
)

export const ReasonBodySchema = extendApi(z.object({ reason: z.string().min(1).max(1000) }).strict(), {
  title: 'ReasonBody',
  description: 'Lý do (revision/reject/withdraw)'
})

// Spec 2026-08-06 — Group E-d: Sửa slot bộ truyện
export const UpdateSeriesSlotBodySchema = extendApi(
  z
    .object({
      magazine: z.string().optional().describe('Tên tạp chí (sau normalize)'),
      startIssueNumber: z.number().int().positive().optional().describe('Số kỳ bắt đầu'),
      publicationType: zEnum(PublicationType, 'PublicationType').optional().describe('Nhịp phát hành')
    })
    .strict(),
  {
    title: 'UpdateSeriesSlotBody',
    description: 'PATCH slot series — Super Admin sửa magazine/startIssueNumber/publicationType'
  }
)

export const SeriesResSchema = extendApi(
  z.object({
    id: z.string(),
    mangakaId: z.string().describe('Chủ sở hữu series (Mangaka tạo proposal)'),
    editorId: z.string().nullable().describe('Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận'),
    mangaka: UserMiniSchema.optional().describe('Thông tin hiển thị chủ series — CÓ ở GET /series + GET /series/:id'),
    editor: UserMiniSchema.nullable()
      .optional()
      .describe('Thông tin hiển thị editor; null = hàng đợi — CÓ ở GET /series + GET /series/:id'),
    coOwnerId: z.string().nullable().describe('Đồng sở hữu sau PARTIAL_TRANSFER (BE-B); null nếu không có'),
    parentSeriesId: z.string().nullable().describe('Series gốc nếu là kế nhiệm (sequel/spinoff)'),
    title: z.string(),
    coverImage: z
      .string()
      .nullable()
      .describe('Object key ảnh bìa (R2) — đổi sang signed GET để hiển thị; KHÔNG phải URL'),
    genres: z.array(zEnum(Genre, 'Genre')),
    demographic: zEnum(Demographic, 'Demographic').nullable(),
    publicationType: zEnum(PublicationType, 'PublicationType').nullable(),
    magazine: z
      .string()
      .nullable()
      .describe('Tạp chí Board chọn khi serial hoá (Flow 1 slot); null tới khi series SERIALIZED'),
    startIssueNumber: z
      .number()
      .int()
      .nullable()
      .describe('Số kỳ (issue) series bắt đầu đăng (Flow 1 slot); null tới khi series SERIALIZED'),
    status: zEnum(SeriesStatus, 'SeriesStatus'),
    statusReason: z
      .string()
      .nullable()
      .describe('Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có'),
    relationshipType: zEnum(RelationshipType, 'RelationshipType').nullable(),
    franchiseConsentStatus: zEnum(FranchiseConsentStatus, 'FranchiseConsentStatus')
      .nullable()
      .describe('Gate đồng ý franchise: null=không gate; PENDING chờ Mangaka gốc; APPROVED/REJECTED đã quyết'),
    createdAt: z.string().describe('ISO 8601'),
    reviewStartedAt: z
      .string()
      .nullable()
      .describe('Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series'),
    // PB-06: completion proposal (Mangaka/Editor đề xuất kết thúc tự nhiên); null nếu chưa đề xuất.
    completionProposal: z
      .object({
        proposedByRole: zEnumString({ MANGAKA: RoleCode.MANGAKA, EDITOR: RoleCode.EDITOR }, 'CompletionProposalRole'),
        proposedById: z.string().describe('UserId người đề xuất'),
        reason: z.string().describe('Lý do đề xuất'),
        proposedEndingChapters: z.number().int().nullable().describe('Số chương kết thúc dự kiến; null nếu không ghi'),
        proposedAt: z.string().describe('ISO 8601')
      })
      .nullable()
      .describe('Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất'),
    proposal: z
      .object({
        synopsis: z.string().nullable(),
        characterDesigns: z.array(z.string()).describe('Mảng object key ảnh thiết kế nhân vật (R2)'),
        storyboardPages: z
          .array(StoryboardPageSchema)
          .describe('Trang phác thảo chương mẫu nộp kèm hồ sơ; fileUrl là object key R2'),
        estimatedLength: z.number().nullable().describe('Số chương ước tính'),
        status: zEnum(ProposalStatus, 'ProposalStatus'),
        createdAt: z.string().describe('ISO 8601')
      })
      .nullable()
      .describe('Hồ sơ proposal (nhúng trong Series); null nếu chưa có'),
    message: z.string().optional().describe('Mô tả hành động vừa thực hiện — chỉ có ở response mutation')
  }),
  {
    title: 'SeriesRes',
    description: 'Series view (shape CHƯA bọc envelope — nằm trong `data`). Audit history không trả ở đây.'
  }
)

export type CreateProposalBodyType = z.infer<typeof CreateProposalBodySchema>
export type UpdateProposalBodyType = z.infer<typeof UpdateProposalBodySchema>
export type UpdateSeriesMetadataBodyType = z.infer<typeof UpdateSeriesMetadataBodySchema>
export type UpdateSeriesSlotBodyType = z.infer<typeof UpdateSeriesSlotBodySchema>
export type ReasonBodyType = z.infer<typeof ReasonBodySchema>
export type ListSeriesQueryType = z.infer<typeof ListSeriesQuerySchema>

export const ListSeriesQuerySchema = extendApi(
  z
    .object({
      status: zEnum(SeriesStatus, 'SeriesStatus').optional(),
      magazine: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe('Lọc theo tạp chí (khớp tuyệt đối). Dùng để chọn series mở kỳ bình chọn.'),
      publicationType: zEnum(PublicationType, 'PublicationType')
        .optional()
        .describe('Lọc theo nhịp phát hành. Kỳ bình chọn chỉ so sánh series cùng tạp chí + cùng nhịp.'),
      limit: z.coerce.number().int().positive().max(100).default(20),
      offset: z.coerce.number().int().nonnegative().default(0)
    })
    .strict(),
  { title: 'ListSeriesQuery', description: 'Lọc danh sách series (theo scope vai trò)' }
)

export const SeriesListItemSchema = extendApi(
  SeriesResSchema.omit({
    proposal: true,
    completionProposal: true,
    statusReason: true,
    reviewStartedAt: true,
    franchiseConsentStatus: true,
    coOwnerId: true,
    parentSeriesId: true,
    relationshipType: true,
    startIssueNumber: true,
    // `message` chỉ có nghĩa ở response mutation (reopen…), KHÔNG thuộc list item.
    message: true
  }),
  { title: 'SeriesListItemRes', description: 'Series item gon cho danh sach; detail xem GET /series/:id' }
)

export const SeriesListResSchema = extendApi(
  z.object({
    items: z.array(SeriesListItemSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number()
  }),
  { title: 'SeriesListRes', description: 'Danh sách series phân trang (shape gọn)' }
)

// Spec 2 / Flow 5: Editor gửi series vào HIATUS. reason bắt buộc; expectedReturnDate optional (ISO 8601).
export const HiatusBodySchema = extendApi(
  z
    .object({
      reason: z.string().min(1).max(1000),
      expectedReturnDate: z.string().datetime({ message: 'expectedReturnDate phải là ISO 8601' }).optional()
    })
    .strict(),
  { title: 'HiatusBody', description: 'Lý do Editor cho series tạm ngưng (Spec 2 Flow 5)' }
)

export type HiatusBodyType = z.infer<typeof HiatusBodySchema>

// Spec 3 / A-SER-06: Mangaka gốc đồng ý/từ chối series phái sinh (franchise gate).
export const FranchiseConsentBodySchema = extendApi(z.object({ approve: z.boolean() }).strict(), {
  title: 'FranchiseConsentBody',
  description: 'Mangaka gốc đồng ý (true)/từ chối (false) series phái sinh'
})

export type FranchiseConsentBodyType = z.infer<typeof FranchiseConsentBodySchema>

// PB-06: Mangaka/Editor proposes natural completion. `reason` mandatory (audited); `proposedEndingChapters`
// is the soft hint for how many chapters the writer expects to deliver.
export const ProposeCompletionBodySchema = extendApi(
  z
    .object({
      reason: z.string().min(1).max(1000),
      proposedEndingChapters: z.number().int().positive().nullish()
    })
    .strict(),
  { title: 'ProposeCompletionBody', description: 'Mangaka/Editor đề xuất kết thúc series tự nhiên (PB-06)' }
)

export type ProposeCompletionBodyType = z.infer<typeof ProposeCompletionBodySchema>
