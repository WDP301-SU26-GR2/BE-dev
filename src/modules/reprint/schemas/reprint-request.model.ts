import { $Enums } from '@prisma/client'
import { z } from 'zod'
import { REPRINT_CHAPTER_STATUS } from '../reprint-request.constant'

export const RevisionMode = $Enums.ReprintRevisionMode
export type RevisionModeType = $Enums.ReprintRevisionMode

// Định nghĩa Object Type cho ReprintChapter (Embedded Type) sử dụng hằng số
export const ReprintChapterSchema = z.object({
  originalChapterId: z.string().nullable(),
  manuscriptFile: z.string().nullable(),
  status: z.nativeEnum(REPRINT_CHAPTER_STATUS)
})
