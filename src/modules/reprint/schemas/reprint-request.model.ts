import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { $Enums } from '@prisma/client'
import { REPRINT_REQUEST_STATUS, REPRINT_CHAPTER_STATUS } from '../reprint-request.constant'

export const RevisionMode = $Enums.ReprintRevisionMode
export type RevisionModeType = $Enums.ReprintRevisionMode

// Định nghĩa Object Type cho ReprintChapter (Embedded Type) sử dụng hằng số
export const ReprintChapterSchema = z.object({
  originalChapterId: z.string().nullable(),
  manuscriptFile: z.string().nullable(),
  status: z.nativeEnum(REPRINT_CHAPTER_STATUS)
})

export const ReprintRequestModelSchema = extendApi(
  z.object({
    id: z.string(),
    seriesId: z.string(),
    requestedBy: z.string().nullable(),
    revisionMode: z.nativeEnum($Enums.ReprintRevisionMode).nullable(),
    reason: z.string().nullable(),
    chapterRangeStart: z.number().int().nullable(),
    chapterRangeEnd: z.number().int().nullable(),
    status: z.nativeEnum(REPRINT_REQUEST_STATUS),
    mangakaApprovedAt: z.coerce.date().nullable(),
    boardApprovedAt: z.coerce.date().nullable(),
    publishedAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    chapters: z.array(ReprintChapterSchema)
  }),
  {
    title: 'ReprintRequestModel',
    description: 'Domain model định nghĩa cấu trúc dữ liệu cho yêu cầu tái bản tác phẩm'
  }
)

export type ReprintRequestModelType = z.infer<typeof ReprintRequestModelSchema>
export type ReprintChapterType = z.infer<typeof ReprintChapterSchema>
