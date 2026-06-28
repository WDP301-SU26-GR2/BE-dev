import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { ChapterStatus, ManuscriptStatus, PageStatus } from '@prisma/client'
import { zEnum } from 'src/core/http/docs/enum-docs'

// ---- Requests ----
export const CreateChapterBodySchema = extendApi(
  z
    .object({
      seriesId: z.string().min(1),
      nameId: z.string().min(1),
      chapterNumber: z.number().int().min(1),
      title: z.string().max(200).optional()
    })
    .strict(),
  { title: 'CreateChapterBody', description: 'Tạo chapter từ Name APPROVED' }
)

export const SetScheduleBodySchema = extendApi(
  z
    .object({
      originalDeadline: z.string().datetime().optional(),
      currentDeadline: z.string().datetime().optional()
    })
    .strict(),
  { title: 'SetScheduleBody', description: 'Đặt deadline cho chapter' }
)

export const ExtendDeadlineBodySchema = extendApi(
  z.object({ newDeadline: z.string().datetime(), reason: z.string().max(1000).optional() }).strict(),
  { title: 'ExtendDeadlineBody', description: 'Editor gia hạn deadline' }
)

export const CreatePageBodySchema = extendApi(
  z.object({ pageNumber: z.number().int().min(1), originalFile: z.string().min(1) }).strict(),
  { title: 'CreatePageBody', description: 'Tạo page (originalFile = object key A7)' }
)

export const UpdatePageBodySchema = extendApi(
  z
    .object({ compositeFile: z.string().min(1).optional(), status: zEnum(PageStatus, 'PageStatus').optional() })
    .strict(),
  { title: 'UpdatePageBody', description: 'Cập nhật composite key / chuyển page status' }
)

export const ReasonBodySchema = extendApi(z.object({ reason: z.string().max(1000).optional() }).strict(), {
  title: 'ReasonBody',
  description: 'Lý do (request-revision)'
})

// ---- Responses ----
export const ScheduleResSchema = z.object({
  id: z.string(),
  chapterId: z.string(),
  originalDeadline: z.string().nullable(),
  currentDeadline: z.string().nullable(),
  extended: z.boolean(),
  extensions: z.array(
    z.object({
      extendedBy: z.string().nullable(),
      previousDeadline: z.string().nullable(),
      newDeadline: z.string().nullable(),
      reason: z.string().nullable(),
      extendedAt: z.string()
    })
  )
})

export const ChapterResSchema = extendApi(
  z.object({
    id: z.string(),
    seriesId: z.string(),
    nameId: z.string().nullable(),
    chapterNumber: z.number(),
    title: z.string().nullable(),
    totalPages: z.number().nullable(),
    status: zEnum(ChapterStatus, 'ChapterStatus'),
    publishedAt: z.string().nullable().describe('ISO 8601; null khi chưa xuất bản'),
    manuscriptStatus: zEnum(ManuscriptStatus, 'ManuscriptStatus').nullable(),
    schedule: ScheduleResSchema.nullable()
  }),
  { title: 'ChapterRes', description: 'Chapter view' }
)

export const PageResSchema = extendApi(
  z.object({
    id: z.string(),
    chapterId: z.string(),
    pageNumber: z.number(),
    originalFile: z.string().nullable().describe('Object key file gốc (pencil/ink) trên R2'),
    compositeFile: z.string().nullable().describe('Object key file composite trên R2'),
    status: zEnum(PageStatus, 'PageStatus'),
    createdAt: z.string()
  }),
  { title: 'PageRes', description: 'Page view' }
)

export const ChapterListResSchema = extendApi(z.object({ items: z.array(ChapterResSchema) }), {
  title: 'ChapterListRes',
  description: 'Danh sách chapter'
})
export const PageListResSchema = extendApi(z.object({ items: z.array(PageResSchema) }), {
  title: 'PageListRes',
  description: 'Danh sách page'
})

export type CreateChapterBodyType = z.infer<typeof CreateChapterBodySchema>
export type SetScheduleBodyType = z.infer<typeof SetScheduleBodySchema>
export type ExtendDeadlineBodyType = z.infer<typeof ExtendDeadlineBodySchema>
export type CreatePageBodyType = z.infer<typeof CreatePageBodySchema>
export type UpdatePageBodyType = z.infer<typeof UpdatePageBodySchema>
export type ReasonBodyType = z.infer<typeof ReasonBodySchema>
