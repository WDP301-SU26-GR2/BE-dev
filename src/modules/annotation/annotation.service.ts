import { Injectable } from '@nestjs/common'
import { AnnotationTargetType } from '@prisma/client'
import { AnnotationRepository } from './annotation.repo'
import { AnnotationForbiddenException, AnnotationNotFoundException } from './errors/annotation.errors'
import { toAnnotationRes } from './annotation.mapper'
import { CreateAnnotationBodyType } from './schemas/annotation-schemas'

@Injectable()
export class AnnotationService {
  constructor(private readonly annotationRepository: AnnotationRepository) {}

  async create(authorId: string, authorRole: string, body: CreateAnnotationBodyType) {
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

  async list(targetType: AnnotationTargetType, targetId: string) {
    const items = await this.annotationRepository.findByTarget(targetType, targetId)
    return { items: items.map(toAnnotationRes) }
  }

  async resolve(userId: string, id: string) {
    const annotation = await this.requireAuthor(userId, id)
    const updated = await this.annotationRepository.setResolved(id, !annotation.isResolved)
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
