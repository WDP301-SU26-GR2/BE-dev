import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { NameKind, NameStatus } from '@prisma/client'
import { zEnum } from 'src/core/http/docs/enum-docs'

export const NamePageSchema = z.object({ pageNumber: z.number().int().min(1), fileUrl: z.string().min(1) }).strict()

export const CreateChapterNameBodySchema = extendApi(z.object({ namePages: z.array(NamePageSchema).min(1) }).strict(), {
  title: 'CreateChapterNameBody',
  description: 'Tạo chapter-Name (namePages; chapterNumber derive từ chapter)'
})

// Spec 12: bỏ filter `kind` (route series-scoped chỉ trả proposal-Name). `.strict()` giữ lại để
// `?kind=CHAPTER` của contract cũ bị reject 422 — KHÔNG im lặng trả nhầm proposal-Name cho FE.
// Phân trang theo convention nhà (limit/offset, như ListSeriesQuery). ⚠ nestjs-zod KHÔNG nhận
// query schema RỖNG (`cleanupOpenApiDoc: Query or url parameters must be an object type` → vỡ boot),
// nên schema phải có property thật — và property đã khai thì service PHẢI dùng.
export const ListNamesQuerySchema = extendApi(
  z
    .object({
      limit: z.coerce.number().int().positive().max(100).default(20),
      offset: z.coerce.number().int().nonnegative().default(0)
    })
    .strict(),
  { title: 'ListNamesQuery', description: 'Phân trang proposal-Name của series (không còn filter kind)' }
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
    chapterId: z.string().nullable().describe('null = proposal-Name; có giá trị = Name của chapter đó'),
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
