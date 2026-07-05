import { Injectable } from '@nestjs/common'
import { AnnotationTargetType, AnnotationType, Prisma, ReviewStage } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

@Injectable()
export class AnnotationRepository {
  constructor(private readonly prismaService: PrismaService) {}

  create(data: {
    authorId: string
    authorRole: string
    targetType: AnnotationTargetType
    targetId: string
    annotationType: AnnotationType
    coordinates?: Record<string, unknown>
    content?: string
    reviewStage?: ReviewStage
    taskId?: string
  }) {
    return this.prismaService.annotation.create({
      data: {
        authorId: data.authorId,
        authorRole: data.authorRole,
        targetType: data.targetType,
        targetId: data.targetId,
        annotationType: data.annotationType,
        coordinates: (data.coordinates ?? undefined) as Prisma.InputJsonValue | undefined,
        content: data.content ?? null,
        reviewStage: data.reviewStage ?? null,
        taskId: data.taskId ?? null
      }
    })
  }

  findById(id: string) {
    return this.prismaService.annotation.findUnique({ where: { id } })
  }

  findByTarget(targetType: AnnotationTargetType, targetId: string) {
    return this.prismaService.annotation.findMany({
      where: { targetType, targetId },
      orderBy: { createdAt: 'asc' }
    })
  }

  async targetExists(targetType: AnnotationTargetType, targetId: string): Promise<boolean> {
    const select = { id: true } as const
    switch (targetType) {
      case AnnotationTargetType.PAGE:
        return Boolean(await this.prismaService.page.findUnique({ where: { id: targetId }, select }))
      case AnnotationTargetType.REGION:
        return Boolean(await this.prismaService.region.findUnique({ where: { id: targetId }, select }))
      case AnnotationTargetType.TASK:
        return Boolean(await this.prismaService.task.findUnique({ where: { id: targetId }, select }))
      case AnnotationTargetType.MANUSCRIPT:
        return Boolean(await this.prismaService.manuscript.findUnique({ where: { id: targetId }, select }))
      case AnnotationTargetType.NAME:
        return Boolean(await this.prismaService.name.findUnique({ where: { id: targetId }, select }))
    }
  }

  setResolved(id: string, isResolved: boolean) {
    return this.prismaService.annotation.update({
      where: { id },
      data: { isResolved, resolvedAt: isResolved ? new Date() : null }
    })
  }

  delete(id: string) {
    return this.prismaService.annotation.delete({ where: { id } })
  }
}
