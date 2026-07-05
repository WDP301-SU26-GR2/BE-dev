import { Injectable } from '@nestjs/common'
import { AnnotationTargetType } from '@prisma/client'
import { AnnotationRepository } from './annotation.repo'
import {
  AnnotationForbiddenException,
  AnnotationNotFoundException,
  AnnotationTargetNotFoundException
} from './errors/annotation.errors'
import { toAnnotationRes } from './annotation.mapper'
import { CreateAnnotationBodyType } from './schemas/annotation-schemas'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class AnnotationService {
  constructor(private readonly annotationRepository: AnnotationRepository) {}

  async create(authorId: string, authorRole: string, body: CreateAnnotationBodyType) {
    if (!OBJECT_ID_RE.test(body.targetId)) throw AnnotationTargetNotFoundException
    if (!(await this.annotationRepository.targetExists(body.targetType, body.targetId))) {
      throw AnnotationTargetNotFoundException
    }
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
    if (!OBJECT_ID_RE.test(targetId)) return { items: [] }
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
