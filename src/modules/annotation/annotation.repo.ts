import { Injectable } from '@nestjs/common'
import { AnnotationTargetType, AnnotationType, Prisma, ReviewStage } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { fetchUserMiniMap } from 'src/core/models/user-mini.model'

export type AnnotationTargetContext = {
  mangakaId: string
  editorId: string | null
  task: {
    id: string
    pageId: string
    regionIds: string[]
    assistantId: string | null
  } | null
}

@Injectable()
export class AnnotationRepository {
  constructor(private readonly prismaService: PrismaService) {}

  private async attachAuthors<T extends { authorId: string | null }>(rows: T[]) {
    const users = await fetchUserMiniMap(
      this.prismaService,
      rows.map((row) => row.authorId)
    )
    return rows.map((row) => ({
      ...row,
      author: row.authorId ? (users.get(row.authorId) ?? null) : null
    }))
  }

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

  async findById(id: string) {
    const row = await this.prismaService.annotation.findUnique({ where: { id } })
    if (!row) return null
    return (await this.attachAuthors([row]))[0]
  }

  async findByTarget(targetType: AnnotationTargetType, targetId: string, page: { limit: number; offset: number }) {
    const rows = await this.prismaService.annotation.findMany({
      where: { targetType, targetId },
      orderBy: { createdAt: 'asc' },
      skip: page.offset,
      take: page.limit
    })
    return this.attachAuthors(rows)
  }

  countByTarget(targetType: AnnotationTargetType, targetId: string) {
    return this.prismaService.annotation.count({ where: { targetType, targetId } })
  }

  async findByTargetForTaskIds(
    targetType: AnnotationTargetType,
    targetId: string,
    taskIds: string[],
    page: { limit: number; offset: number }
  ) {
    if (taskIds.length === 0) return []
    const rows = await this.prismaService.annotation.findMany({
      where: { targetType, targetId, taskId: { in: taskIds } },
      orderBy: { createdAt: 'asc' },
      skip: page.offset,
      take: page.limit
    })
    return this.attachAuthors(rows)
  }

  countByTargetForTaskIds(targetType: AnnotationTargetType, targetId: string, taskIds: string[]) {
    if (taskIds.length === 0) return Promise.resolve(0)
    return this.prismaService.annotation.count({ where: { targetType, targetId, taskId: { in: taskIds } } })
  }

  async findTargetContext(targetType: AnnotationTargetType, targetId: string): Promise<AnnotationTargetContext | null> {
    const selectSeries = { mangakaId: true, editorId: true } as const
    switch (targetType) {
      case AnnotationTargetType.PAGE: {
        const page = await this.prismaService.page.findUnique({
          where: { id: targetId },
          select: { chapter: { select: { series: { select: selectSeries } } } }
        })
        return page ? { ...page.chapter.series, task: null } : null
      }
      case AnnotationTargetType.REGION: {
        const region = await this.prismaService.region.findUnique({
          where: { id: targetId },
          select: { page: { select: { chapter: { select: { series: { select: selectSeries } } } } } }
        })
        return region ? { ...region.page.chapter.series, task: null } : null
      }
      case AnnotationTargetType.TASK: {
        const task = await this.prismaService.task.findUnique({
          where: { id: targetId },
          select: { id: true, pageId: true, regionIds: true, assistantId: true }
        })
        if (!task) return null
        const page = await this.prismaService.page.findUnique({
          where: { id: task.pageId },
          select: { chapter: { select: { series: { select: selectSeries } } } }
        })
        return page
          ? {
              ...page.chapter.series,
              task: { id: task.id, pageId: task.pageId, regionIds: task.regionIds, assistantId: task.assistantId }
            }
          : null
      }
      case AnnotationTargetType.MANUSCRIPT: {
        const manuscript = await this.prismaService.manuscript.findUnique({
          where: { id: targetId },
          select: { chapter: { select: { series: { select: selectSeries } } } }
        })
        return manuscript ? { ...manuscript.chapter.series, task: null } : null
      }
      case AnnotationTargetType.STORYBOARD: {
        const storyboard = await this.prismaService.storyboard.findUnique({
          where: { id: targetId },
          select: { series: { select: selectSeries } }
        })
        return storyboard ? { ...storyboard.series, task: null } : null
      }
    }
  }

  async findTaskForAnnotation(taskId: string) {
    return this.prismaService.task.findUnique({
      where: { id: taskId },
      select: { id: true, pageId: true, regionIds: true, assistantId: true }
    })
  }

  async findAssignedTaskIdsForTarget(assistantId: string, targetType: AnnotationTargetType, targetId: string) {
    const where =
      targetType === AnnotationTargetType.PAGE
        ? { assistantId, pageId: targetId }
        : targetType === AnnotationTargetType.REGION
          ? { assistantId, regionIds: { has: targetId } }
          : null
    if (!where) return []
    const tasks = await this.prismaService.task.findMany({ where, select: { id: true } })
    return tasks.map((task) => task.id)
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
      case AnnotationTargetType.STORYBOARD:
        return Boolean(await this.prismaService.storyboard.findUnique({ where: { id: targetId }, select }))
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
