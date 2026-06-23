import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { PublicationType, RelationshipType } from '@prisma/client'

const NamePageSchema = z.object({ pageNumber: z.number().int().min(1), fileUrl: z.string().min(1) })

export const CreateProposalBodySchema = extendApi(
  z
    .object({
      title: z.string().min(1).max(200),
      genre: z.string().optional(),
      demographic: z.string().optional(),
      publicationType: z.nativeEnum(PublicationType).optional(),
      synopsis: z.string().max(5000).optional(),
      characterDesigns: z.array(z.string()).default([]),
      targetDemographic: z.string().optional(),
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
      title: z.string().min(1).max(200).optional(),
      genre: z.string().optional(),
      demographic: z.string().optional(),
      publicationType: z.nativeEnum(PublicationType).optional(),
      synopsis: z.string().max(5000).optional(),
      characterDesigns: z.array(z.string()).optional(),
      targetDemographic: z.string().optional(),
      estimatedLength: z.number().int().min(1).optional(),
      namePages: z.array(NamePageSchema).optional()
    })
    .strict(),
  { title: 'UpdateProposalBody', description: 'Sửa proposal khi DRAFT' }
)

export const ReasonBodySchema = extendApi(z.object({ reason: z.string().min(1).max(1000) }).strict(), {
  title: 'ReasonBody',
  description: 'Lý do (revision/reject/withdraw)'
})

export const UpdateNamePagesBodySchema = extendApi(z.object({ pages: z.array(NamePageSchema) }).strict(), {
  title: 'UpdateNamePagesBody',
  description: 'Cập nhật trang Name'
})

export const SeriesResSchema = extendApi(
  z.object({
    id: z.string(),
    mangakaId: z.string(),
    editorId: z.string().nullable(),
    coOwnerId: z.string().nullable(),
    parentSeriesId: z.string().nullable(),
    title: z.string(),
    genre: z.string().nullable(),
    demographic: z.string().nullable(),
    publicationType: z.string().nullable(),
    status: z.string(),
    statusReason: z.string().nullable(),
    relationshipType: z.string().nullable(),
    createdAt: z.string(),
    proposal: z
      .object({
        nameId: z.string().nullable(),
        synopsis: z.string().nullable(),
        characterDesigns: z.array(z.string()),
        targetDemographic: z.string().nullable(),
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
