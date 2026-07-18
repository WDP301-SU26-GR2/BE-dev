import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import {
  Demographic,
  FranchiseConsentStatus,
  Genre,
  NameKind,
  NameStatus,
  ProposalStatus,
  PublicationType,
  RelationshipType,
  SeriesStatus
} from '@prisma/client'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { UserMiniSchema } from 'src/core/models/user-mini.model'

const NamePageSchema = z.object({ pageNumber: z.number().int().min(1), fileUrl: z.string().min(1) })

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
      namePages: z.array(NamePageSchema).default([]),
      parentSeriesId: z.string().optional(),
      relationshipType: zEnum(RelationshipType, 'RelationshipType').optional()
    })
    .strict(),
  { title: 'CreateProposalBody', description: 'Tạo proposal + Name mẫu' }
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
      estimatedLength: z.number().int().min(1).nullish()
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
        proposedByRole: z.string().describe('Vai trò người đề xuất (MANGAKA|EDITOR)'),
        proposedById: z.string().describe('UserId người đề xuất'),
        reason: z.string().describe('Lý do đề xuất'),
        proposedEndingChapters: z.number().int().nullable().describe('Số chương kết thúc dự kiến; null nếu không ghi'),
        proposedAt: z.string().describe('ISO 8601')
      })
      .nullable()
      .describe('Đề xuất kết thúc tự nhiên (PB-06); null nếu chưa đề xuất'),
    proposal: z
      .object({
        nameId: z.string().nullable().describe('Id Name chương mẫu gắn proposal'),
        synopsis: z.string().nullable(),
        characterDesigns: z.array(z.string()).describe('Mảng object key ảnh thiết kế nhân vật (R2)'),
        estimatedLength: z.number().nullable().describe('Số chương ước tính'),
        status: zEnum(ProposalStatus, 'ProposalStatus'),
        createdAt: z.string().describe('ISO 8601')
      })
      .nullable()
      .describe('Hồ sơ proposal (nhúng trong Series); null nếu chưa có')
  }),
  {
    title: 'SeriesRes',
    description: 'Series view (shape CHƯA bọc envelope — nằm trong `data`). Audit history không trả ở đây.'
  }
)

export const NameResSchema = extendApi(
  z.object({
    id: z.string(),
    seriesId: z.string(),
    chapterNumber: z.number().nullable().describe('null cho Name chương mẫu của proposal'),
    // Spec 8: kind field exposed so FE can distinguish PROPOSAL vs CHAPTER on the bundled
    // CreateProposalRes payload (and anywhere else series module returns a Name).
    kind: zEnum(NameKind, 'NameKind'),
    status: zEnum(NameStatus, 'NameStatus'),
    version: z.number().describe('Tăng mỗi lần resubmit'),
    submittedAt: z.string().nullable().describe('ISO 8601; null khi chưa submit'),
    pages: z.array(NamePageSchema).describe('Các trang vẽ thô; fileUrl là object key (R2)')
  }),
  { title: 'NameRes', description: 'Name view (shape CHƯA bọc envelope — nằm trong `data`)' }
)

export const CreateProposalResSchema = extendApi(z.object({ series: SeriesResSchema, name: NameResSchema }), {
  title: 'CreateProposalRes',
  description: 'Series + Name mẫu vừa tạo'
})

export type CreateProposalBodyType = z.infer<typeof CreateProposalBodySchema>
export type UpdateProposalBodyType = z.infer<typeof UpdateProposalBodySchema>
export type UpdateSeriesMetadataBodyType = z.infer<typeof UpdateSeriesMetadataBodySchema>
export type ReasonBodyType = z.infer<typeof ReasonBodySchema>
export type ListSeriesQueryType = z.infer<typeof ListSeriesQuerySchema>

export const ListSeriesQuerySchema = extendApi(
  z
    .object({
      status: zEnum(SeriesStatus, 'SeriesStatus').optional(),
      limit: z.coerce.number().int().positive().max(100).default(20),
      offset: z.coerce.number().int().nonnegative().default(0)
    })
    .strict(),
  { title: 'ListSeriesQuery', description: 'Lọc danh sách series (theo scope vai trò)' }
)

export const SeriesListResSchema = extendApi(
  z.object({
    items: z.array(SeriesResSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number()
  }),
  { title: 'SeriesListRes', description: 'Danh sách series phân trang' }
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
