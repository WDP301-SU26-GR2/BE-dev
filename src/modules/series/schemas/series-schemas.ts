import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import {
  Demographic,
  Genre,
  NameStatus,
  ProposalStatus,
  PublicationType,
  RelationshipType,
  SeriesStatus
} from '@prisma/client'
import { zEnum } from 'src/core/http/docs/enum-docs'

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

export const ReasonBodySchema = extendApi(z.object({ reason: z.string().min(1).max(1000) }).strict(), {
  title: 'ReasonBody',
  description: 'Lý do (revision/reject/withdraw)'
})

export const UpdateNamePagesBodySchema = extendApi(z.object({ pages: z.array(NamePageSchema) }).strict(), {
  title: 'UpdateNamePagesBody',
  description: 'Cập nhật trang Name'
})

export const AddNamePageBodySchema = extendApi(NamePageSchema.strict(), {
  title: 'AddNamePageBody',
  description: 'Thêm 1 trang vào Name'
})

export const SeriesResSchema = extendApi(
  z.object({
    id: z.string(),
    mangakaId: z.string().describe('Chủ sở hữu series (Mangaka tạo proposal)'),
    editorId: z.string().nullable().describe('Editor phụ trách; null = đang ở hàng đợi review chưa ai nhận'),
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
    status: zEnum(SeriesStatus, 'SeriesStatus'),
    statusReason: z
      .string()
      .nullable()
      .describe('Lý do của lần đổi status gần nhất (reject/withdraw/cancel...); null nếu không có'),
    relationshipType: zEnum(RelationshipType, 'RelationshipType').nullable(),
    createdAt: z.string().describe('ISO 8601'),
    reviewStartedAt: z
      .string()
      .nullable()
      .describe('Mốc Editor bắt đầu review (set 1 lần ở action review đầu); có giá trị = khoá nhả series'),
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
export type ReasonBodyType = z.infer<typeof ReasonBodySchema>
export type UpdateNamePagesBodyType = z.infer<typeof UpdateNamePagesBodySchema>
export type AddNamePageBodyType = z.infer<typeof AddNamePageBodySchema>
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

export const NameListResSchema = extendApi(z.object({ items: z.array(NameResSchema) }), {
  title: 'NameListRes',
  description: 'Danh sách Name của series'
})
