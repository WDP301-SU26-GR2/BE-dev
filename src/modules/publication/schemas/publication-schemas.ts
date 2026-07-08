import { extendApi } from '@anatine/zod-openapi'
import { ReadingDirection } from '@prisma/client'
import { z } from 'zod'
import { zEnum } from 'src/core/http/docs/enum-docs'

const VERSION_TYPES = ['ORIGINAL', 'DIGITAL', 'FLIPPED'] as const

export const CreatePublicationVersionSchema = extendApi(
  z
    .object({
      language: z.string().min(1).max(20).describe('Mã ngôn ngữ, vd JA/EN/VI'),
      readingDirection: zEnum(ReadingDirection, 'ReadingDirection').default(ReadingDirection.RTL),
      versionType: z.enum(VERSION_TYPES).nullish().describe('ORIGINAL | DIGITAL | FLIPPED'),
      notes: z.string().max(2000).nullish()
    })
    .strict(),
  { title: 'CreatePublicationVersionBody', description: 'Tạo phiên bản phát hành cho series' }
)

export const UpdatePublicationVersionSchema = extendApi(
  z
    .object({
      language: z.string().min(1).max(20).nullish(),
      readingDirection: zEnum(ReadingDirection, 'ReadingDirection').nullish(),
      versionType: z.enum(VERSION_TYPES).nullish(),
      notes: z.string().max(2000).nullish()
    })
    .strict(),
  { title: 'UpdatePublicationVersionBody', description: 'Sửa partial phiên bản phát hành' }
)

export const PublicationVersionResSchema = extendApi(
  z.object({
    id: z.string(),
    seriesId: z.string(),
    language: z.string(),
    readingDirection: zEnum(ReadingDirection, 'ReadingDirection'),
    versionType: z.string().nullable().describe('ORIGINAL | DIGITAL | FLIPPED (hoặc null nếu không set)'),
    notes: z.string().nullable(),
    createdAt: z.string().describe('ISO 8601')
  }),
  { title: 'PublicationVersionRes', description: 'Publication version view' }
)

export const PublicationVersionListResSchema = extendApi(z.object({ items: z.array(PublicationVersionResSchema) }), {
  title: 'PublicationVersionListRes',
  description: 'Danh sách phiên bản phát hành của series'
})

export type CreatePublicationVersionType = z.infer<typeof CreatePublicationVersionSchema>
export type UpdatePublicationVersionType = z.infer<typeof UpdatePublicationVersionSchema>
export type PublicationVersionResType = z.infer<typeof PublicationVersionResSchema>
