import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { PublicationType, RelationshipType, SeriesStatus } from '@prisma/client'

const NamePageSchema = z.object({ pageNumber: z.number().int().min(1), fileUrl: z.string().min(1) })

export const CreateProposalBodySchema = extendApi(
  z
    .object({
      title: z.string().min(1).max(200),
      coverImage: z.string().min(1).optional(),
      genre: z.string().optional(),
      demographic: z.string().optional(),
      publicationType: z.nativeEnum(PublicationType).optional(),
      synopsis: z.string().max(5000).optional(),
      characterDesigns: z.array(z.string()).default([]),
      estimatedLength: z.number().int().min(1).optional(),
      namePages: z.array(NamePageSchema).default([]),
      parentSeriesId: z.string().optional(),
      relationshipType: z.nativeEnum(RelationshipType).optional()
    })
    .strict(),
  { title: 'CreateProposalBody', description: 'Tạo proposal + Name mẫu' }
)

export const UpdateProposalBodySchema = extendApi(
  z
    .object({
      title: z.string().min(1).max(200).nullish(),
      coverImage: z.string().min(1).nullish(),
      genre: z.string().nullish(),
      demographic: z.string().nullish(),
      publicationType: z.nativeEnum(PublicationType).nullish(),
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
    mangakaId: z.string(),
    editorId: z.string().nullable(),
    coOwnerId: z.string().nullable(),
    parentSeriesId: z.string().nullable(),
    title: z.string(),
    coverImage: z.string().nullable(),
    genre: z.string().nullable(),
    demographic: z.string().nullable(),
    publicationType: z.string().nullable(),
    status: z.string(),
    statusReason: z.string().nullable(),
    relationshipType: z.string().nullable(),
    createdAt: z.string(),
    reviewStartedAt: z.string().nullable(),
    proposal: z
      .object({
        nameId: z.string().nullable(),
        synopsis: z.string().nullable(),
        characterDesigns: z.array(z.string()),
        estimatedLength: z.number().nullable(),
        status: z.string(),
        createdAt: z.string()
      })
      .nullable()
  }),
  { title: 'SeriesRes', description: 'Series view (audit history không trả ở đây)' }
)

export const NameResSchema = extendApi(
  z.object({
    id: z.string(),
    seriesId: z.string(),
    chapterNumber: z.number().nullable(),
    status: z.string(),
    version: z.number(),
    submittedAt: z.string().nullable(),
    pages: z.array(NamePageSchema)
  }),
  { title: 'NameRes', description: 'Name view' }
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
      status: z.nativeEnum(SeriesStatus).optional(),
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
