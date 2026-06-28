import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { AnnotationTargetType, AnnotationType, ReviewStage } from '@prisma/client'
import { ENUM_DOCS, zEnum } from 'src/core/http/docs/enum-docs'

export const CreateAnnotationBodySchema = extendApi(
  z
    .object({
      targetType: zEnum(AnnotationTargetType, 'AnnotationTargetType'),
      targetId: z.string().min(1),
      annotationType: zEnum(AnnotationType, 'AnnotationType'),
      coordinates: z.record(z.string(), z.unknown()).optional(),
      content: z.string().max(5000).optional(),
      reviewStage: zEnum(ReviewStage, 'ReviewStage').optional(),
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
    authorRole: z.string().nullable().describe(`RoleCode của người tạo annotation: ${ENUM_DOCS.RoleCode}`),
    targetType: zEnum(AnnotationTargetType, 'AnnotationTargetType').nullable(),
    targetId: z.string().nullable(),
    annotationType: zEnum(AnnotationType, 'AnnotationType').nullable(),
    reviewStage: zEnum(ReviewStage, 'ReviewStage').nullable(),
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
// zEnum(AnnotationTargetType) → targetType sai/thiếu tự fail 422 (không để Prisma 500).
export const ListAnnotationQuerySchema = extendApi(
  z.object({ targetType: zEnum(AnnotationTargetType, 'AnnotationTargetType'), targetId: z.string().min(1) }).strict(),
  { title: 'ListAnnotationQuery', description: 'Lọc annotation theo target (bắt buộc cả 2)' }
)

export type CreateAnnotationBodyType = z.infer<typeof CreateAnnotationBodySchema>
export type ListAnnotationQueryType = z.infer<typeof ListAnnotationQuerySchema>
