import { Injectable } from '@nestjs/common'
import { AnnotationRepository } from './annotation.repo'
import { AnnotationForbiddenException, AnnotationNotFoundException } from './errors/annotation.errors'
import { toAnnotationRes } from './annotation.mapper'
import { CreateAnnotationBodyType, ListAnnotationQueryType } from './schemas/annotation-schemas'
import { AnnotationAccessService } from './services/annotation-access.service'

@Injectable()
export class AnnotationService {
  constructor(
    private readonly annotationRepository: AnnotationRepository,
    private readonly annotationAccessService: AnnotationAccessService
  ) {}

  async create(authorId: string, authorRole: string, body: CreateAnnotationBodyType) {
    await this.annotationAccessService.assertCanCreate(
      { userId: authorId, roleName: authorRole },
      body.targetType,
      body.targetId
    )
    await this.annotationAccessService.assertTaskBinding(body.targetType, body.targetId, body.taskId)
    const created = await this.annotationRepository.create({
      authorId,
      authorRole,
      targetType: body.targetType,
      targetId: body.targetId,
      annotationType: body.annotationType,
      coordinates: body.coordinates,
      content: body.content,
      reviewStage: body.reviewStage,
      taskId: body.taskId
    })
    return toAnnotationRes(created)
  }

  async list(userId: string, roleName: string, query: ListAnnotationQueryType) {
    const { targetType, targetId, limit, offset } = query
    const scope = await this.annotationAccessService.listScope({ userId, roleName }, targetType, targetId)
    const page = { limit, offset }
    // Assistant chỉ thấy annotation thuộc task được giao ⇒ count phải cùng scope với find,
    // nếu không `total` sẽ tố cáo số annotation họ không được đọc.
    const [items, total] =
      scope.taskIds === null
        ? await Promise.all([
            this.annotationRepository.findByTarget(targetType, targetId, page),
            this.annotationRepository.countByTarget(targetType, targetId)
          ])
        : await Promise.all([
            this.annotationRepository.findByTargetForTaskIds(targetType, targetId, scope.taskIds, page),
            this.annotationRepository.countByTargetForTaskIds(targetType, targetId, scope.taskIds)
          ])
    return { items: items.map(toAnnotationRes), total, limit, offset }
  }

  async resolve(userId: string, id: string) {
    await this.requireAuthor(userId, id)
    // Keep PATCH /resolve idempotent: retries or double-clicks must not reopen a resolved annotation.
    const updated = await this.annotationRepository.setResolved(id, true)
    return toAnnotationRes(updated)
  }

  async remove(userId: string, id: string) {
    await this.requireAuthor(userId, id)
    await this.annotationRepository.delete(id)
    return { id }
  }

  private async requireAuthor(userId: string, id: string) {
    const annotation = await this.annotationRepository.findById(id)
    if (!annotation) throw AnnotationNotFoundException
    if (annotation.authorId !== userId) throw AnnotationForbiddenException
    return annotation
  }
}
