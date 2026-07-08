import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { $Enums } from '@prisma/client'
import { ReprintChapterSchema } from './reprint-request.model'

// B-RPT-01: Payload tạo yêu cầu tái bản ban đầu từ Board/Editor
export const CreateReprintRequestBodySchema = extendApi(
  z
    .object({
      seriesId: z.string().min(1, { message: 'seriesId là bắt buộc' }),
      revisionMode: z.nativeEnum($Enums.ReprintRevisionMode),
      reason: z.string().min(1, { message: 'reason không được để trống' }),
      chapterRangeStart: z.number().int().positive({ message: 'chapterRangeStart phải lớn hơn 0' }),
      chapterRangeEnd: z.number().int().positive({ message: 'chapterRangeEnd phải lớn hơn 0' })
    })
    .strict()
    .refine((data) => data.chapterRangeEnd >= data.chapterRangeStart, {
      message: 'chapterRangeEnd phải lớn hơn hoặc bằng chapterRangeStart',
      path: ['chapterRangeEnd']
    }),
  {
    title: 'CreateReprintRequestBody',
    description: 'Editor tạo yêu cầu tái bản'
  }
)

// B-RPT-02: Payload quyết định phản hồi của Mangaka (Chấp nhận/Từ chối)
export const MangakaReviewReprintBodySchema = extendApi(
  z
    .object({
      accept: z.boolean({ message: 'Trường accept phải là giá trị boolean' }),
      reason: z.string().optional()
    })
    .strict(),
  {
    title: 'MangakaReviewReprintBody',
    description: 'Mangaka phản hồi yêu cầu tái bản'
  }
)

// B-RPT-02: Payload quyết định duyệt tối cao của Hội đồng (Duyệt/Từ chối)
export const BoardApproveReprintBodySchema = extendApi(
  z
    .object({
      approve: z.boolean({ message: 'Trường approve phải là giá trị boolean' }),
      reason: z.string().optional()
    })
    .strict(),
  {
    title: 'BoardApproveReprintBody',
    description: 'Board duyệt/từ chối yêu cầu tái bản'
  }
)

// B-RPT-03: Payload nộp bản thảo sửa đổi cho từng chương (Dành cho Mangaka khi chọn WITH_REVISION)
export const SubmitChapterManuscriptBodySchema = extendApi(
  z
    .object({
      originalChapterId: z.string().min(1, { message: 'originalChapterId là bắt buộc' }),
      manuscriptFile: z.string().min(1, { message: 'manuscriptFile là đường dẫn file hợp lệ' })
    })
    .strict(),
  {
    title: 'SubmitChapterManuscriptBody',
    description: 'Mangaka nộp manuscript sửa đổi cho chapter'
  }
)

// B-RPT-03: Payload Editor duyệt chất lượng của chương tái bản trong danh sách embedded chapters
export const EditorApproveChapterBodySchema = extendApi(
  z
    .object({
      originalChapterId: z.string().min(1, { message: 'originalChapterId là bắt buộc' }),
      approve: z.boolean({ message: 'Trường approve phải là giá trị boolean' })
    })
    .strict(),
  {
    title: 'EditorApproveChapterBody',
    description: 'Editor duyệt/yêu cầu sửa chapter tái bản'
  }
)

export const ReprintRequestResSchema = extendApi(
  z.object({
    id: z.string(),
    seriesId: z.string(),
    requestedBy: z.string().nullable(),
    revisionMode: z.nativeEnum($Enums.ReprintRevisionMode).nullable(),
    reason: z.string().nullable(),
    chapterRangeStart: z.number().int().nullable(),
    chapterRangeEnd: z.number().int().nullable(),
    status: z.string(),
    mangakaApprovedAt: z.any().nullable(),
    boardApprovedAt: z.any().nullable(),
    publishedAt: z.any().nullable(),
    createdAt: z.any(),
    chapters: z.array(ReprintChapterSchema)
  }),
  {
    title: 'ReprintRequestRes',
    description: 'Chi tiết yêu cầu tái bản'
  }
)

export const ReprintRequestListResSchema = extendApi(
  z.object({
    data: z.array(ReprintRequestResSchema)
  }),
  {
    title: 'ReprintRequestListRes',
    description: 'Danh sách yêu cầu tái bản'
  }
)

export const ReprintChapterResSchema = extendApi(ReprintChapterSchema, {
  title: 'ReprintChapterRes',
  description: 'Chi tiết chapter trong yêu cầu tái bản'
})

export const ReprintChapterListResSchema = extendApi(
  z.object({
    data: z.array(ReprintChapterSchema)
  }),
  {
    title: 'ReprintChapterListRes',
    description: 'Danh sách chapter trong yêu cầu tái bản'
  }
)

export type CreateReprintRequestBodyType = z.infer<typeof CreateReprintRequestBodySchema>
export type MangakaReviewReprintBodyType = z.infer<typeof MangakaReviewReprintBodySchema>
export type BoardApproveReprintBodyType = z.infer<typeof BoardApproveReprintBodySchema>
export type SubmitChapterManuscriptBodyType = z.infer<typeof SubmitChapterManuscriptBodySchema>
export type EditorApproveChapterBodyType = z.infer<typeof EditorApproveChapterBodySchema>

// PB-07: Gán reviser cho chapter tái bản (chỉ áp dụng khi revisionMode=WITH_REVISION & contract=FULL_BUYOUT)
export const AssignReviserBodySchema = extendApi(
  z
    .object({
      reviserId: z.string().min(1, { message: 'reviserId là bắt buộc' }),
      reviserType: z.nativeEnum($Enums.ReviserType)
    })
    .strict(),
  {
    title: 'AssignReviserBody',
    description: 'Gán reviser cho chapter tái bản (INTERNAL_TEAM hoặc OTHER_MANGAKA)'
  }
)
export type AssignReviserBodyType = z.infer<typeof AssignReviserBodySchema>
