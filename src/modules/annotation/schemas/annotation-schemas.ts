import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { AnnotationTargetType, AnnotationType, ReviewStage } from '@prisma/client'
import { ENUM_DOCS, zEnum } from 'src/core/http/docs/enum-docs'
import { UserMiniSchema } from 'src/core/models/user-mini.model'

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
    createdAt: z.string(),
    author: UserMiniSchema.nullable().optional().describe('Người tạo annotation — có ở GET list/detail')
  }),
  { title: 'AnnotationRes', description: 'Annotation view' }
)

// Spec 25: KHÔNG tách list-item cho annotation. `content` là chính nội dung ghi chú review và
// module này KHÔNG có route detail (`GET /annotations/:id` không tồn tại) — bỏ khỏi list là
// content biến mất khỏi mọi đường GET, làm chết markup review (Flow 3 Mangaka↔Assistant).
// Bù lại bằng PHÂN TRANG: `content` cap 5000 ký tự mà list trước đây trả không giới hạn số bản ghi,
// nên một target nhiều ghi chú dài là response phình không kiểm soát được.
export const AnnotationListResSchema = extendApi(
  z.object({
    items: z.array(AnnotationResSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number()
  }),
  {
    title: 'AnnotationListRes',
    description: 'Danh sách annotation phân trang (mặc định 20/trang, tối đa 100)'
  }
)

// Query cho GET /annotations — BẮT BUỘC cả targetType + targetId (tránh trả toàn bộ annotation).
// zEnum(AnnotationTargetType) → targetType sai/thiếu tự fail 422 (không để Prisma 500).
export const ListAnnotationQuerySchema = extendApi(
  z
    .object({
      targetType: zEnum(AnnotationTargetType, 'AnnotationTargetType'),
      targetId: z.string().min(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
      offset: z.coerce.number().int().nonnegative().default(0)
    })
    .strict(),
  { title: 'ListAnnotationQuery', description: 'Lọc annotation theo target (bắt buộc cả 2) + phân trang' }
)

export type CreateAnnotationBodyType = z.infer<typeof CreateAnnotationBodySchema>
export type ListAnnotationQueryType = z.infer<typeof ListAnnotationQuerySchema>
