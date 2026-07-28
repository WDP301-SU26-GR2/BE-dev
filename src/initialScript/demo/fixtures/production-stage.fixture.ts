import { AiSegmentSource, ProductionStage, ProductionStageStatus } from '@prisma/client'
import { DEFAULT_STAGE_TEMPLATE } from 'src/modules/chapter/production-stage.constant'
import { DAY, requiredMedia } from './demo-seed.helpers'
import { DemoContext, SeriesSeed } from './demo-seed.types'

export type ProductionStageCheckpoint = 'ACTIVE_INKING' | 'ACTIVE_FINAL_CHECK' | 'COMPLETED'

type SeedPage = {
  id: string
  originalFile: string | null
}

export const seedProductionStages = async (
  context: DemoContext,
  series: SeriesSeed,
  chapterId: string,
  pages: readonly SeedPage[],
  checkpoint: ProductionStageCheckpoint
) => {
  if (pages.some((page) => !page.originalFile)) throw new Error(`Chapter ${chapterId} has a page without originalFile`)

  const activeOrder = checkpoint === 'ACTIVE_INKING' ? 1 : checkpoint === 'ACTIVE_FINAL_CHECK' ? 4 : null
  const stages: ProductionStage[] = []
  for (const template of DEFAULT_STAGE_TEMPLATE) {
    const status =
      activeOrder === template.order
        ? ProductionStageStatus.ACTIVE
        : activeOrder == null || template.order < activeOrder
          ? ProductionStageStatus.COMPLETED
          : ProductionStageStatus.LOCKED
    stages.push(
      await context.prisma.productionStage.create({
        data: {
          chapterId,
          order: template.order,
          name: template.name,
          taskTypes: template.taskTypes,
          isFinalCheck: template.isFinalCheck,
          status,
          deadline: new Date(context.now.getTime() + template.order * DAY),
          startedAt:
            status === ProductionStageStatus.LOCKED
              ? null
              : new Date(context.now.getTime() - (5 - template.order) * DAY),
          completedAt:
            status === ProductionStageStatus.COMPLETED
              ? new Date(context.now.getTime() - (4 - template.order) * DAY)
              : null
        }
      })
    )
  }

  const inkingOutput = requiredMedia(context.media, 'finished-line-art').key
  const detailingOutput = requiredMedia(context.media, 'cleaned-lettering-page').key
  const letteringOutput = requiredMedia(context.media, 'scanlated-page').key
  const stageOutputs = [inkingOutput, detailingOutput, letteringOutput]

  for (const stage of stages) {
    if (stage.status === ProductionStageStatus.LOCKED) continue
    const inputRevision = stage.order
    const inputFile = (page: SeedPage) =>
      stage.order === 1 ? (page.originalFile as string) : stageOutputs[stage.order - 2]
    const outputFile = stage.isFinalCheck ? null : stageOutputs[stage.order - 1]
    await context.prisma.productionStagePage.createMany({
      data: pages.map((page) => ({
        stageId: stage.id,
        pageId: page.id,
        inputSourceType: stage.order === 1 ? AiSegmentSource.ORIGINAL : AiSegmentSource.COMPOSITE,
        inputFileKey: inputFile(page),
        inputRevision,
        outputSourceType:
          stage.status === ProductionStageStatus.COMPLETED && outputFile ? AiSegmentSource.COMPOSITE : null,
        outputFileKey: stage.status === ProductionStageStatus.COMPLETED ? outputFile : null,
        outputRevision: stage.status === ProductionStageStatus.COMPLETED && outputFile ? stage.order + 1 : null,
        outputConfirmedAt:
          stage.status === ProductionStageStatus.COMPLETED && outputFile
            ? new Date(context.now.getTime() - (4 - stage.order) * DAY)
            : null,
        outputConfirmedBy: stage.status === ProductionStageStatus.COMPLETED && outputFile ? series.mangakaId : null
      }))
    })
  }

  if (checkpoint !== 'ACTIVE_INKING') {
    await context.prisma.page.updateMany({
      where: { id: { in: pages.map((page) => page.id) } },
      data: { compositeFile: letteringOutput, compositeRevision: 4 }
    })
  }

  const activeStage = stages.find((stage) => stage.status === ProductionStageStatus.ACTIVE) ?? null
  return { stages, activeStage }
}
