import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { $Enums } from '@prisma/client'

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
    description: 'Payload tạo mới yêu cầu tái bản tác phẩm từ Ban biên tập/Hội đồng'
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
    description: 'Payload quyết định phản hồi từ Mangaka đối với yêu cầu tái bản'
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
    description: 'Payload phê duyệt hoặc bác bỏ yêu cầu tái bản từ phía Hội đồng'
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
    description: 'Payload cập nhật bản thảo sửa đổi cho một chương truyện cụ thể'
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
    description: 'Payload Editor phê duyệt hoặc yêu cầu chỉnh sửa lại chương truyện tái bản'
  }
)

export type CreateReprintRequestBodyType = z.infer<typeof CreateReprintRequestBodySchema>
export type MangakaReviewReprintBodyType = z.infer<typeof MangakaReviewReprintBodySchema>
export type BoardApproveReprintBodyType = z.infer<typeof BoardApproveReprintBodySchema>
export type SubmitChapterManuscriptBodyType = z.infer<typeof SubmitChapterManuscriptBodySchema>
export type EditorApproveChapterBodyType = z.infer<typeof EditorApproveChapterBodySchema>
