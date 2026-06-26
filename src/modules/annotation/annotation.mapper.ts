import { Annotation } from '@prisma/client'

export function toAnnotationRes(a: Annotation) {
  return {
    id: a.id,
    taskId: a.taskId ?? null,
    authorId: a.authorId ?? null,
    authorRole: a.authorRole ?? null,
    targetType: a.targetType ?? null,
    targetId: a.targetId ?? null,
    annotationType: a.annotationType ?? null,
    reviewStage: a.reviewStage ?? null,
    coordinates: (a.coordinates as Record<string, unknown> | null) ?? null,
    content: a.content ?? null,
    isResolved: a.isResolved,
    resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString()
  }
}
