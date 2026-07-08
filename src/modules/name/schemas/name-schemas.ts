import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { NameKind, NameStatus } from '@prisma/client'
import { zEnum } from 'src/core/http/docs/enum-docs'

export const NamePageSchema = z.object({ pageNumber: z.number().int().min(1), fileUrl: z.string().min(1) }).strict()

export const CreateChapterNameBodySchema = extendApi(
  z
    .object({
      chapterNumber: z.number().int().positive(),
      namePages: z.array(NamePageSchema).min(1)
    })
    .strict(),
  { title: 'CreateChapterNameBody', description: 'Tạo chapter-Name (chapterNumber + namePages)' }
)

export const ListNamesQuerySchema = extendApi(
  z
    .object({
      kind: zEnum(NameKind, 'NameKind').optional()
    })
    .strict(),
  { title: 'ListNamesQuery', description: 'Filter kind (PROPOSAL|CHAPTER) — optional' }
)

export const UpdateNamePagesBodySchema = extendApi(z.object({ pages: z.array(NamePageSchema) }).strict(), {
  title: 'UpdateNamePagesBody',
  description: 'Cập nhật trang Name'
})

export const AddNamePageBodySchema = extendApi(NamePageSchema.strict(), {
  title: 'AddNamePageBody',
  description: 'Thêm 1 trang vào Name'
})

export const ReasonBodySchema = extendApi(z.object({ reason: z.string().min(1).max(1000) }).strict(), {
  title: 'ReasonBody',
  description: 'Lý do (revision/reject/withdraw)'
})

export const NameResSchema = extendApi(
  z.object({
    id: z.string(),
    seriesId: z.string(),
    chapterNumber: z
      .number()
      .nullable()
      .describe('null cho Name chương mẫu của proposal; N = Name của chương N (kind=CHAPTER)'),
    kind: zEnum(NameKind, 'NameKind'),
    status: zEnum(NameStatus, 'NameStatus'),
    version: z.number().describe('Tăng mỗi lần resubmit'),
    pages: z.array(NamePageSchema).describe('Các trang vẽ thô; fileUrl là object key (R2)'),
    submittedAt: z.string().nullable().describe('ISO 8601; null khi chưa submit')
  }),
  { title: 'NameRes', description: 'Name view (shape CHƯA bọc envelope — nằm trong `data`)' }
)

export const NameListResSchema = extendApi(z.object({ items: z.array(NameResSchema) }), {
  title: 'NameListRes',
  description: 'Danh sách Name của series'
})

export type CreateChapterNameBodyType = z.infer<typeof CreateChapterNameBodySchema>
export type UpdateNamePagesBodyType = z.infer<typeof UpdateNamePagesBodySchema>
export type AddNamePageBodyType = z.infer<typeof AddNamePageBodySchema>
export type ReasonBodyType = z.infer<typeof ReasonBodySchema>
export type ListNamesQueryType = z.infer<typeof ListNamesQuerySchema>
export type NameResType = z.infer<typeof NameResSchema>
export type NameListResType = z.infer<typeof NameListResSchema>
