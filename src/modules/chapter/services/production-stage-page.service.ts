import { Injectable } from '@nestjs/common'
import { AiSegmentSource, ProductionStageStatus } from '@prisma/client'
import { isObjectId } from 'src/core/http/schemas/object-id.schema'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ChapterRepository } from '../chapter.repo'
import { ChapterNotFoundException, ChapterOnHoldException } from '../errors/chapter.errors'
import {
  StageAccessDeniedException,
  StageHasOpenTasksException,
  StageNotActiveException,
  StageNotFoundException,
  StageOutputInvalidException,
  StagePageNotFoundException
} from '../errors/production-stage.errors'
import { ConfirmStageOutputCommand, ProductionStageRepository } from '../production-stage.repo'
import { ConfirmStageOutputsBodyType } from '../schemas/production-stage-schemas'

@Injectable()
export class ProductionStagePageService {
  constructor(
    private readonly repo: ProductionStageRepository,
    private readonly chapterRepo: ChapterRepository
  ) {}

  private async loadChapter(chapterId: string) {
    if (!isObjectId(chapterId)) throw ChapterNotFoundException
    const chapter = await this.chapterRepo.findChapterById(chapterId)
    if (!chapter) throw ChapterNotFoundException
    const series = await this.chapterRepo.findSeriesById(chapter.seriesId)
    if (!series) throw ChapterNotFoundException
    return { chapter, series }
  }

  private async assertReadAccess(user: { userId: string; roleName: string }, chapterId: string) {
    const context = await this.loadChapter(chapterId)
    const allowed =
      (user.roleName === RoleName.MANGAKA && context.series.mangakaId === user.userId) ||
      (user.roleName === RoleName.EDITOR && context.series.editorId === user.userId)
    if (!allowed) throw StageAccessDeniedException
    return context
  }

  async listStagePages(user: { userId: string; roleName: string }, chapterId: string, stageId: string) {
    await this.assertReadAccess(user, chapterId)
    const stage = await this.repo.findById(stageId)
    if (!stage || stage.chapterId !== chapterId) throw StageNotFoundException
    return { items: (await this.repo.findStagePages(stageId)).map((page) => this.toRes(page)) }
  }

  async confirmOutputs(userId: string, chapterId: string, stageId: string, body: ConfirmStageOutputsBodyType) {
    const { chapter, series } = await this.loadChapter(chapterId)
    if (series.mangakaId !== userId) throw StageAccessDeniedException
    if (chapter.hold) throw ChapterOnHoldException
    const stage = await this.repo.findById(stageId)
    if (!stage || stage.chapterId !== chapterId) throw StageNotFoundException
    if (stage.status !== ProductionStageStatus.ACTIVE) throw StageNotActiveException

    const pages = await this.repo.findStagePages(stageId)
    const inputIds = body.items.map((item) => item.pageId)
    if (new Set(inputIds).size !== inputIds.length || pages.length !== body.items.length)
      throw StageOutputInvalidException
    const byId = new Map(pages.map((page) => [page.pageId, page]))
    if (inputIds.some((id) => !byId.has(id))) throw StagePageNotFoundException
    for (const item of body.items) {
      const stagePage = byId.get(item.pageId)
      if (!stagePage) throw StagePageNotFoundException
      if ((await this.repo.countOpenTasksForStagePage(stageId, item.pageId)) > 0) throw StageHasOpenTasksException
      const expectedFile = item.reuseInput ? stagePage.inputFileKey : item.fileKey
      const expectedSource = item.reuseInput ? stagePage.inputSourceType : 'COMPOSITE'
      if (stagePage.outputConfirmedAt) {
        if (
          stagePage.outputFileKey !== expectedFile ||
          stagePage.outputSourceType !== expectedSource ||
          (item.reuseInput && stagePage.outputRevision !== stagePage.inputRevision)
        ) {
          throw StageOutputInvalidException
        }
      }
    }
    if (pages.every((page) => page.outputConfirmedAt)) return { items: pages.map((page) => this.toRes(page)) }
    const commands: ConfirmStageOutputCommand[] = body.items.map((item) => {
      const stagePage = byId.get(item.pageId)
      if (!stagePage) throw StagePageNotFoundException
      if (item.reuseInput) {
        return {
          pageId: item.pageId,
          outputSourceType: stagePage.inputSourceType,
          outputFileKey: stagePage.inputFileKey,
          outputRevision: stagePage.inputRevision
        }
      }
      if (!item.fileKey) throw StageOutputInvalidException
      const outputRevision = stagePage.page.compositeRevision + 1
      return {
        pageId: item.pageId,
        outputSourceType: AiSegmentSource.COMPOSITE,
        outputFileKey: item.fileKey,
        outputRevision,
        compositeUpdate: { fileKey: item.fileKey, revision: outputRevision }
      }
    })
    const updated = await this.repo.confirmOutputs(stageId, userId, commands)
    return { items: updated.map((page) => this.toRes(page)) }
  }

  private toRes(page: {
    stageId: string
    pageId: string
    inputSourceType: AiSegmentSource
    inputFileKey: string
    inputRevision: number
    outputSourceType: AiSegmentSource | null
    outputFileKey: string | null
    outputRevision: number | null
    outputConfirmedAt: Date | null
    outputConfirmedBy: string | null
  }) {
    return {
      stageId: page.stageId,
      pageId: page.pageId,
      inputSourceType: page.inputSourceType,
      inputFileKey: page.inputFileKey,
      inputRevision: page.inputRevision,
      outputSourceType: page.outputSourceType,
      outputFileKey: page.outputFileKey,
      outputRevision: page.outputRevision,
      outputConfirmedAt: page.outputConfirmedAt?.toISOString() ?? null,
      outputConfirmedBy: page.outputConfirmedBy,
      outputReady:
        Boolean(page.outputConfirmedAt) &&
        Boolean(page.outputFileKey) &&
        page.outputRevision != null &&
        page.outputSourceType != null
    }
  }
}
