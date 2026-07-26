import { Injectable } from '@nestjs/common'
import { AiSegmentSource, Prisma, ProductionStageStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

type StageSeedRow = Prisma.ProductionStageCreateManyInput

export type ConfirmStageOutputCommand = {
  pageId: string
  outputSourceType: AiSegmentSource
  outputFileKey: string
  outputRevision: number
  compositeUpdate?: {
    fileKey: string
    revision: number
  }
}

@Injectable()
export class ProductionStageRepository {
  constructor(private readonly prisma: PrismaService) {}

  countByChapter(chapterId: string) {
    return this.prisma.productionStage.count({ where: { chapterId } })
  }

  findByChapter(chapterId: string) {
    return this.prisma.productionStage.findMany({ where: { chapterId }, orderBy: { order: 'asc' } })
  }

  findById(id: string) {
    return this.prisma.productionStage.findUnique({ where: { id } })
  }

  findActiveByChapter(chapterId: string) {
    return this.prisma.productionStage.findFirst({ where: { chapterId, status: ProductionStageStatus.ACTIVE } })
  }

  findFinalCheck(chapterId: string) {
    return this.prisma.productionStage.findFirst({ where: { chapterId, isFinalCheck: true } })
  }

  updateStatus(id: string, status: ProductionStageStatus, at: Date) {
    const data: Prisma.ProductionStageUpdateInput =
      status === ProductionStageStatus.ACTIVE
        ? { status, startedAt: at }
        : status === ProductionStageStatus.COMPLETED
          ? { status, completedAt: at }
          : { status }
    return this.prisma.productionStage.update({ where: { id }, data })
  }

  updateMeta(id: string, data: { name?: string; deadline?: Date | null }) {
    return this.prisma.productionStage.update({ where: { id }, data })
  }

  create(data: Prisma.ProductionStageUncheckedCreateInput) {
    return this.prisma.productionStage.create({ data })
  }

  deleteById(id: string) {
    return this.prisma.productionStage.delete({ where: { id } })
  }

  shiftOrderFrom(chapterId: string, fromOrder: number, delta: number) {
    return this.prisma.productionStage.updateMany({
      where: { chapterId, order: { gte: fromOrder } },
      data: { order: { increment: delta } }
    })
  }

  countTasksByStage(stageId: string, statuses: string[]) {
    return this.prisma.task.count({ where: { stageId, status: { in: statuses as never } } })
  }

  countOpenTasksForStagePage(stageId: string, pageId: string) {
    return this.prisma.task.count({
      where: {
        stageId,
        pageId,
        status: { in: ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'ON_HOLD'] }
      }
    })
  }

  countPagesByChapter(chapterId: string) {
    return this.prisma.page.count({ where: { chapterId } })
  }

  async findTasksForStageAnalytics(chapterId: string) {
    const pages = await this.prisma.page.findMany({ where: { chapterId }, select: { id: true } })
    if (pages.length === 0) return []
    return this.prisma.task.findMany({
      where: { stageId: { isSet: true }, pageId: { in: pages.map((page) => page.id) } },
      select: {
        id: true,
        stageId: true,
        taskType: true,
        assistantId: true,
        status: true,
        deadline: true,
        startedAt: true,
        completedAt: true
      }
    })
  }

  findStagePages(stageId: string) {
    return this.prisma.productionStagePage.findMany({
      where: { stageId },
      include: { page: { select: { compositeRevision: true } } },
      orderBy: { page: { pageNumber: 'asc' } }
    })
  }

  findStagePage(stageId: string, pageId: string) {
    return this.prisma.productionStagePage.findUnique({ where: { stageId_pageId: { stageId, pageId } } })
  }

  async seedStagesAndFirstInputs(chapterId: string, rows: StageSeedRow[]) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.productionStage.count({ where: { chapterId } })
      if (existing > 0) return
      const stages: Array<Awaited<ReturnType<typeof tx.productionStage.create>>> = []
      for (const row of rows) stages.push(await tx.productionStage.create({ data: row }))
      const first = stages.find((stage) => stage.order === 1)
      if (!first) return
      const pages = await tx.page.findMany({ where: { chapterId }, select: { id: true, originalFile: true } })
      if (pages.some((page) => !page.originalFile)) return
      if (pages.length > 0) {
        await tx.productionStagePage.createMany({
          data: pages.map((page) => ({
            stageId: first.id,
            pageId: page.id,
            inputSourceType: AiSegmentSource.ORIGINAL,
            inputFileKey: page.originalFile as string,
            inputRevision: 1
          }))
        })
      }
    })
  }

  async createPageWithFirstStageInput(chapterId: string, data: { pageNumber: number; originalFile: string }) {
    return this.prisma.$transaction(async (tx) => {
      const page = await tx.page.create({ data: { chapterId, ...data } })
      const first = await tx.productionStage.findFirst({ where: { chapterId }, orderBy: { order: 'asc' } })
      if (first) {
        await tx.productionStagePage.create({
          data: {
            stageId: first.id,
            pageId: page.id,
            inputSourceType: AiSegmentSource.ORIGINAL,
            inputFileKey: data.originalFile,
            inputRevision: 1
          }
        })
      }
      return page
    })
  }

  async completeAndOpenNext(
    stage: { id: string; chapterId: string },
    next: { id: string } | null,
    pages: Array<{
      pageId: string
      outputSourceType: AiSegmentSource | null
      outputFileKey: string | null
      outputRevision: number | null
    }>,
    now: Date
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.productionStage.update({
        where: { id: stage.id },
        data: { status: ProductionStageStatus.COMPLETED, completedAt: now }
      })
      if (!next) return
      await tx.productionStagePage.createMany({
        data: pages.map((page) => ({
          stageId: next.id,
          pageId: page.pageId,
          inputSourceType: page.outputSourceType as AiSegmentSource,
          inputFileKey: page.outputFileKey as string,
          inputRevision: page.outputRevision as number
        }))
      })
      await tx.productionStage.update({
        where: { id: next.id },
        data: { status: ProductionStageStatus.ACTIVE, startedAt: now }
      })
    })
  }

  async confirmOutputs(stageId: string, actorId: string, commands: ConfirmStageOutputCommand[]) {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date()
      for (const command of commands) {
        if (command.compositeUpdate) {
          await tx.page.update({
            where: { id: command.pageId },
            data: {
              compositeFile: command.compositeUpdate.fileKey,
              compositeRevision: command.compositeUpdate.revision
            }
          })
        }
        await tx.productionStagePage.update({
          where: { stageId_pageId: { stageId, pageId: command.pageId } },
          data: {
            outputSourceType: command.outputSourceType,
            outputFileKey: command.outputFileKey,
            outputRevision: command.outputRevision,
            outputConfirmedAt: now,
            outputConfirmedBy: actorId
          }
        })
      }
      return tx.productionStagePage.findMany({
        where: { stageId },
        include: { page: { select: { compositeRevision: true } } },
        orderBy: { page: { pageNumber: 'asc' } }
      })
    })
  }
}
