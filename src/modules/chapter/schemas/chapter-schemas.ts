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
      nameId: z.string().min(1),
      title: z.string().max(200).optional()
    })
    .strict(),
  { title: 'CreateChapterBody', description: 'Tạo chapter từ Name APPROVED (chapterNumber derive từ Name)' }
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

export const HoldChapterBodySchema = extendApi(
  z.object({ reason: z.string().min(1), expectedReturnDate: z.string().datetime().optional() }).strict(),
  { title: 'HoldChapterBody', description: 'Editor temporarily pauses chapter production' }
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
    pagesCompleted: z.number(),
    pagesInProgress: z.number(),
    pagesNotStarted: z.number(),
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
  pagesCompleted: z.number(),
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
export type ReasonBodyType = z.infer<typeof ReasonBodySchema>
export type HoldChapterBodyType = z.infer<typeof HoldChapterBodySchema>
