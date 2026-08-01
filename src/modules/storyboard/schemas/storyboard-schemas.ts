import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { StoryboardStatus } from '@prisma/client'
import { zEnum } from 'src/core/http/docs/enum-docs'

export const StoryboardPageSchema = z
  .object({ pageNumber: z.number().int().min(1), fileUrl: z.string().min(1) })
  .strict()

export const CreateChapterStoryboardBodySchema = extendApi(
  z.object({ storyboardPages: z.array(StoryboardPageSchema).min(1) }).strict(),
  {
    title: 'CreateChapterStoryboardBody',
    description: 'Tạo chapter-storyboard từ danh sách storyboardPages'
  }
)

// Spec 28: Storyboard giờ chỉ phục vụ chương — không còn ListStoryboardsQuery của series-scoped.

export const UpdateStoryboardPagesBodySchema = extendApi(z.object({ pages: z.array(StoryboardPageSchema) }).strict(), {
  title: 'UpdateStoryboardPagesBody',
  description: 'Cập nhật trang storyboard'
})

export const AddStoryboardPageBodySchema = extendApi(StoryboardPageSchema.strict(), {
  title: 'AddStoryboardPageBody',
  description: 'Thêm 1 trang vào storyboard'
})

export const ReasonBodySchema = extendApi(z.object({ reason: z.string().min(1).max(1000) }).strict(), {
  title: 'ReasonBody',
  description: 'Lý do (revision/reject/withdraw)'
})

export const StoryboardResSchema = extendApi(
  z.object({
    id: z.string(),
    seriesId: z.string(),
    chapterId: z.string().describe('Storyboard LUÔN thuộc 1 chapter (Spec 28)'),
    status: zEnum(StoryboardStatus, 'StoryboardStatus'),
    version: z.number().describe('Tăng mỗi lần resubmit'),
    pages: z.array(StoryboardPageSchema).describe('Các trang vẽ thô; fileUrl là object key (R2)'),
    submittedAt: z.string().nullable().describe('ISO 8601; null khi chưa submit')
  }),
  {
    title: 'StoryboardRes',
    description: 'Storyboard view (shape CHƯA bọc envelope — nằm trong `data`)'
  }
)

export const StoryboardListResSchema = extendApi(z.object({ items: z.array(StoryboardResSchema) }), {
  title: 'StoryboardListRes',
  description: 'Danh sách storyboard của chapter'
})

export type CreateChapterStoryboardBodyType = z.infer<typeof CreateChapterStoryboardBodySchema>
export type UpdateStoryboardPagesBodyType = z.infer<typeof UpdateStoryboardPagesBodySchema>
export type AddStoryboardPageBodyType = z.infer<typeof AddStoryboardPageBodySchema>
export type ReasonBodyType = z.infer<typeof ReasonBodySchema>
export type StoryboardResType = z.infer<typeof StoryboardResSchema>
export type StoryboardListResType = z.infer<typeof StoryboardListResSchema>
