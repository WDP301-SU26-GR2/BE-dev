import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { ChapterStatus, ManuscriptStatus, NameStatus, PageStatus } from '@prisma/client'
import { zEnum } from 'src/core/http/docs/enum-docs'
import { WARNING_LEVEL } from '../chapter.constant'

// ---- Requests ----
export const CreateChapterBodySchema = extendApi(
  z
    .object({
      seriesId: z.string().min(1),
      chapterNumber: z.number().int().positive(),
      title: z.string().max(200).optional()
    })
    .strict(),
  {
    title: 'CreateChapterBody',
    description: 'Tạo chapter (chapter-first): chapterNumber + title; Name tạo sau qua POST /chapters/:id/names'
  }
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
    .object({
      compositeFile: z.string().min(1).nullish().describe('Object key bản tổng hợp (A7)'),
      pageNumber: z.number().int().min(1).nullish().describe('Đổi số trang; trùng số trong cùng chapter → 409')
    })
    .strict(),
  {
    title: 'UpdatePageBody',
    description: 'Cập nhật file/số trang; trạng thái Page do backend quản lý (omit/null = giữ nguyên)'
  }
)

export const DeletePagesBulkBodySchema = extendApi(
  z
    .object({
      pageIds: z
        .array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'pageId không hợp lệ'))
        .min(1)
        .max(50)
        .describe('Danh sách page cần xoá (tối đa 50) — all-or-nothing')
    })
    .strict(),
  { title: 'DeletePagesBulkBody', description: 'Xoá nhiều trang trong cùng chapter (all-or-nothing)' }
)

export const DeletePageResSchema = extendApi(
  z.object({
    pageId: z.string(),
    deletedRegions: z.number().describe('Số vùng bị xoá theo trang'),
    deletedTasks: z.number().describe('Số task bị xoá theo trang')
  }),
  { title: 'DeletePageRes', description: 'Kết quả xoá trang kèm cascade' }
)

export const DeletePagesBulkResSchema = extendApi(
  z.object({
    deletedPages: z.number(),
    deletedRegions: z.number(),
    deletedTasks: z.number()
  }),
  { title: 'DeletePagesBulkRes', description: 'Kết quả xoá nhiều trang' }
)

export const ReasonBodySchema = extendApi(z.object({ reason: z.string().max(1000).optional() }).strict(), {
  title: 'OptionalReasonBody',
  description: 'Optional reason for co-owner rejection and other general chapter actions'
})

// Spec 14 §1.5.1 (BREAKING): a manuscript revision request must explain what needs changing.
// ReasonBodySchema remains optional because co-owner-reject also uses it.
export const RevisionReasonBodySchema = extendApi(z.object({ reason: z.string().min(1).max(1000) }).strict(), {
  title: 'RevisionReasonBody',
  description: 'Lý do yêu cầu sửa (bắt buộc)'
})

export const HoldChapterBodySchema = extendApi(
  z.object({ reason: z.string().min(1), expectedReturnDate: z.string().datetime().optional() }).strict(),
  { title: 'HoldChapterBody', description: 'Editor temporarily pauses chapter production' }
)

export const UpdateChapterBodySchema = extendApi(
  z
    .object({
      title: z.string().max(200).nullish(),
      chapterNumber: z.number().int().positive().nullish()
    })
    .strict(),
  { title: 'UpdateChapterBody', description: 'Sửa title (pre-PUBLISHED) + chapterNumber (chỉ khi DRAFT)' }
)

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
    hold: z
      .object({
        reason: z.string(),
        expectedReturnDate: z.string().nullable(),
        heldBy: z.string(),
        heldAt: z.string()
      })
      .nullable()
      .describe('null = chapter is not on hold'),
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
    displayFile: z
      .string()
      .nullable()
      .describe('Ảnh nên HIỂN THỊ = compositeFile ?? originalFile. FE dùng field này để render, khỏi tự fallback'),
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

export const ChapterProgressResSchema = extendApi(
  z.object({
    chapterId: z.string(),
    nameStatus: zEnum(NameStatus, 'NameStatus').nullable().describe('null = chapter không gắn Name'),
    totalPages: z.number(),
    pagesReady: z.number().describe('Số trang đã hết task mở (sẵn sàng nộp)'),
    pagesPending: z.number().describe('Số trang còn task đang mở'),
    taskBreakdown: z.object({
      assigned: z.number(),
      inProgress: z.number(),
      submitted: z.number(),
      underReview: z.number(),
      approved: z.number(),
      revisionRequested: z.number(),
      onHold: z.number(),
      cancelled: z.number()
    }),
    deadline: z.string().nullable(),
    remainingHours: z.number().nullable(),
    progressPct: z.number(),
    warningLevel: zEnum(WARNING_LEVEL, 'WarningLevel'),
    onHold: z.boolean()
  }),
  { title: 'ChapterProgressRes', description: 'Chapter progress dashboard payload' }
)

export const StudioOverviewItemSchema = z.object({
  chapterId: z.string(),
  seriesId: z.string(),
  seriesTitle: z.string(),
  chapterNumber: z.number(),
  title: z.string().nullable(),
  manuscriptStatus: zEnum(ManuscriptStatus, 'ManuscriptStatus').nullable(),
  deadline: z.string().nullable(),
  remainingHours: z.number().nullable(),
  progressPct: z.number(),
  warningLevel: zEnum(WARNING_LEVEL, 'WarningLevel'),
  onHold: z.boolean(),
  pagesReady: z.number().describe('Số trang đã hết task mở (sẵn sàng nộp)'),
  pagesPending: z.number().describe('Số trang còn task đang mở'),
  totalPages: z.number(),
  openTasks: z.number()
})

export const StudioOverviewResSchema = extendApi(z.object({ items: z.array(StudioOverviewItemSchema) }), {
  title: 'StudioOverviewRes',
  description: 'Mangaka studio overview sorted by warning severity and deadline'
})

export type CreateChapterBodyType = z.infer<typeof CreateChapterBodySchema>
export type SetScheduleBodyType = z.infer<typeof SetScheduleBodySchema>
export type ExtendDeadlineBodyType = z.infer<typeof ExtendDeadlineBodySchema>
export type CreatePageBodyType = z.infer<typeof CreatePageBodySchema>
export type UpdatePageBodyType = z.infer<typeof UpdatePageBodySchema>
export type DeletePagesBulkBodyType = z.infer<typeof DeletePagesBulkBodySchema>
export type ReasonBodyType = z.infer<typeof ReasonBodySchema>
export type RevisionReasonBodyType = z.infer<typeof RevisionReasonBodySchema>
export type HoldChapterBodyType = z.infer<typeof HoldChapterBodySchema>
export type UpdateChapterBodyType = z.infer<typeof UpdateChapterBodySchema>
