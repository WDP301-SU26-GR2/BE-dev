import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'

export const CreateAssistantReviewBodySchema = extendApi(
  z
    .object({
      assistantId: z.string(),
      rating: z.number().int().min(1).max(5),
      comment: z.string().max(1000).optional(),
      studioAssignmentId: z.string(),
      seriesId: z.string().optional()
    })
    .strict(),
  { title: 'CreateAssistantReviewBody', description: 'Mangaka đánh giá Assistant' }
)

export const CreateMangakaReviewBodySchema = extendApi(
  z
    .object({
      mangakaId: z.string(),
      rating: z.number().int().min(1).max(5),
      comment: z.string().max(1000).optional(),
      seriesId: z.string().optional()
    })
    .strict(),
  { title: 'CreateMangakaReviewBody', description: 'Editor đánh giá Mangaka' }
)

export const ReviewResSchema = extendApi(
  z.object({
    id: z.string(),
    rating: z.number(),
    comment: z.string().nullable(),
    createdAt: z.string(), // ISO 8601 (KHÔNG dùng z.date())
    reviewer: z
      .object({
        id: z.string(),
        displayName: z.string().nullable(),
        avatar: z.string().nullable()
      })
      .optional()
  }),
  { title: 'ReviewRes', description: 'Một review' }
)

export const ReviewListResSchema = extendApi(z.object({ items: z.array(ReviewResSchema) }), {
  title: 'ReviewListRes',
  description: 'Danh sách review'
})

export const ListAssistantReviewsQuerySchema = extendApi(
  z
    .object({
      assistantId: z.string().min(1),
      limit: z.coerce.number().int().positive().optional(),
      offset: z.coerce.number().int().nonnegative().optional()
    })
    .strict(),
  { title: 'ListAssistantReviewsQuery', description: 'Query danh sách review của Assistant' }
)

export const ListMangakaReviewsQuerySchema = extendApi(
  z
    .object({
      mangakaId: z.string().min(1),
      limit: z.coerce.number().int().positive().optional(),
      offset: z.coerce.number().int().nonnegative().optional()
    })
    .strict(),
  { title: 'ListMangakaReviewsQuery', description: 'Query danh sách review của Mangaka' }
)

export type CreateAssistantReviewBodyType = z.infer<typeof CreateAssistantReviewBodySchema>
export type CreateMangakaReviewBodyType = z.infer<typeof CreateMangakaReviewBodySchema>
export type ListAssistantReviewsQueryType = z.infer<typeof ListAssistantReviewsQuerySchema>
export type ListMangakaReviewsQueryType = z.infer<typeof ListMangakaReviewsQuerySchema>
export type ReviewResType = z.infer<typeof ReviewResSchema>
