import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { AnnotationTargetType, AnnotationType, ReviewStage } from '@prisma/client'

export const CreateAnnotationBodySchema = extendApi(
  z
    .object({
      targetType: z.nativeEnum(AnnotationTargetType),
      targetId: z.string().min(1),
      annotationType: z.nativeEnum(AnnotationType),
      coordinates: z.record(z.string(), z.unknown()).optional(),
      content: z.string().max(5000).optional(),
      reviewStage: z.nativeEnum(ReviewStage).optional(),
      taskId: z.string().optional()
    })
    .strict(),
  { title: 'CreateAnnotationBody', description: 'Tạo markup annotation' }
)

export const AnnotationResSchema = extendApi(
  z.object({
    id: z.string(),
    taskId: z.string().nullable(),
    authorId: z.string().nullable(),
    authorRole: z.string().nullable(),
    targetType: z.string().nullable(),
    targetId: z.string().nullable(),
    annotationType: z.string().nullable(),
    reviewStage: z.string().nullable(),
    coordinates: z.record(z.string(), z.unknown()).nullable(),
    content: z.string().nullable(),
    isResolved: z.boolean(),
    resolvedAt: z.string().nullable(),
    createdAt: z.string()
  }),
  { title: 'AnnotationRes', description: 'Annotation view' }
)

export const AnnotationListResSchema = extendApi(z.object({ items: z.array(AnnotationResSchema) }), {
  title: 'AnnotationListRes',
  description: 'Danh sách annotation'
})

// Query cho GET /annotations — BẮT BUỘC cả targetType + targetId (tránh trả toàn bộ annotation).
// z.nativeEnum(AnnotationTargetType) → targetType sai/thiếu tự fail 422 (không để Prisma 500).
export const ListAnnotationQuerySchema = extendApi(
  z.object({ targetType: z.nativeEnum(AnnotationTargetType), targetId: z.string().min(1) }).strict(),
  { title: 'ListAnnotationQuery', description: 'Lọc annotation theo target (bắt buộc cả 2)' }
)

export type CreateAnnotationBodyType = z.infer<typeof CreateAnnotationBodySchema>
export type ListAnnotationQueryType = z.infer<typeof ListAnnotationQuerySchema>
