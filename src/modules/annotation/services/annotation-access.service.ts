import { Injectable } from '@nestjs/common'
import { AnnotationTargetType } from '@prisma/client'
import { RoleName } from 'src/core/security/constants/role.constant'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { AnnotationRepository } from '../annotation.repo'
import {
  AnnotationForbiddenException,
  AnnotationTargetNotFoundException,
  AnnotationTaskBindingInvalidException
} from '../errors/annotation.errors'

type AnnotationActor = { userId: string; roleName: string }

@Injectable()
export class AnnotationAccessService {
  constructor(private readonly annotationRepository: AnnotationRepository) {}

  async assertCanCreate(actor: AnnotationActor, targetType: AnnotationTargetType, targetId: string) {
    const context = await this.requireTarget(targetType, targetId)
    if (actor.roleName === RoleName.MANGAKA && context.mangakaId === actor.userId) return context
    if (actor.roleName === RoleName.EDITOR && context.editorId === actor.userId) return context
    throw AnnotationForbiddenException
  }

  async listScope(actor: AnnotationActor, targetType: AnnotationTargetType, targetId: string) {
    const context = await this.requireTarget(targetType, targetId)
    if (
      (actor.roleName === RoleName.MANGAKA && context.mangakaId === actor.userId) ||
      (actor.roleName === RoleName.EDITOR && context.editorId === actor.userId)
    ) {
      return { taskIds: null }
    }

    if (actor.roleName !== RoleName.ASSISTANT) throw AnnotationForbiddenException
    if (targetType === AnnotationTargetType.TASK && context.task?.assistantId === actor.userId) {
      return { taskIds: null }
    }
    if (targetType !== AnnotationTargetType.PAGE && targetType !== AnnotationTargetType.REGION) {
      throw AnnotationForbiddenException
    }
    const taskIds = await this.annotationRepository.findAssignedTaskIdsForTarget(actor.userId, targetType, targetId)
    if (taskIds.length === 0) throw AnnotationForbiddenException
    return { taskIds }
  }

  async assertTaskBinding(targetType: AnnotationTargetType, targetId: string, taskId: string | undefined) {
    if (!taskId) return
    if (!isObjectId(taskId)) throw AnnotationTaskBindingInvalidException
    const task = await this.annotationRepository.findTaskForAnnotation(taskId)
    if (!task) throw AnnotationTaskBindingInvalidException
    if (targetType === AnnotationTargetType.MANUSCRIPT || targetType === AnnotationTargetType.STORYBOARD) {
      throw AnnotationTaskBindingInvalidException
    }

    const matchesTarget =
      (targetType === AnnotationTargetType.PAGE && task.pageId === targetId) ||
      (targetType === AnnotationTargetType.REGION && task.regionIds.includes(targetId)) ||
      (targetType === AnnotationTargetType.TASK && task.id === targetId)
    if (!matchesTarget) throw AnnotationTaskBindingInvalidException
  }

  private async requireTarget(targetType: AnnotationTargetType, targetId: string) {
    if (!isObjectId(targetId)) throw AnnotationTargetNotFoundException
    const context = await this.annotationRepository.findTargetContext(targetType, targetId)
    if (!context) throw AnnotationTargetNotFoundException
    return context
  }
}
