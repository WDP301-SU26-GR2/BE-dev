import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { ChapterCommandRepository } from './repositories/chapter-command.repository'
import { ChapterProgressQueryRepository } from './repositories/chapter-progress-query.repository'
import { ChapterQueryRepository } from './repositories/chapter-query.repository'

@Injectable()
export class ChapterRepository {
  private readonly queries: ChapterQueryRepository
  private readonly progressQueries: ChapterProgressQueryRepository
  private readonly commands: ChapterCommandRepository

  constructor(private readonly prisma: PrismaService) {
    this.queries = new ChapterQueryRepository(prisma)
    this.progressQueries = new ChapterProgressQueryRepository(prisma)
    this.commands = new ChapterCommandRepository(prisma, this.queries)
  }

  withTransaction<T>(work: (repository: ChapterRepository) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(new ChapterRepository(tx as unknown as PrismaService)))
  }

  get findSeriesById(): typeof this.queries.findSeriesById {
    return this.queries.findSeriesById.bind(this.queries) as typeof this.queries.findSeriesById
  }
  get findNameById(): typeof this.queries.findNameById {
    return this.queries.findNameById.bind(this.queries) as typeof this.queries.findNameById
  }
  get countChaptersBySeriesId(): typeof this.queries.countChaptersBySeriesId {
    return this.queries.countChaptersBySeriesId.bind(this.queries) as typeof this.queries.countChaptersBySeriesId
  }
  get findExecutedContractBySeriesId(): typeof this.queries.findExecutedContractBySeriesId {
    return this.queries.findExecutedContractBySeriesId.bind(
      this.queries
    ) as typeof this.queries.findExecutedContractBySeriesId
  }
  get createChapter(): typeof this.commands.createChapter {
    return this.commands.createChapter.bind(this.commands) as typeof this.commands.createChapter
  }
  get findChapterById(): typeof this.queries.findChapterById {
    return this.queries.findChapterById.bind(this.queries) as typeof this.queries.findChapterById
  }
  get findChapterWithRelations(): typeof this.queries.findChapterWithRelations {
    return this.queries.findChapterWithRelations.bind(this.queries) as typeof this.queries.findChapterWithRelations
  }
  get findChapterWithSeries(): typeof this.queries.findChapterWithSeries {
    return this.queries.findChapterWithSeries.bind(this.queries) as typeof this.queries.findChapterWithSeries
  }
  get updateChapter(): typeof this.commands.updateChapter {
    return this.commands.updateChapter.bind(this.commands) as typeof this.commands.updateChapter
  }
  get updateNameChapterNumber(): typeof this.commands.updateNameChapterNumber {
    return this.commands.updateNameChapterNumber.bind(this.commands) as typeof this.commands.updateNameChapterNumber
  }
  get findChaptersBySeriesId(): typeof this.queries.findChaptersBySeriesId {
    return this.queries.findChaptersBySeriesId.bind(this.queries) as typeof this.queries.findChaptersBySeriesId
  }
  get findChapterByNumber(): typeof this.queries.findChapterByNumber {
    return this.queries.findChapterByNumber.bind(this.queries) as typeof this.queries.findChapterByNumber
  }
  get findManuscriptByChapterId(): typeof this.queries.findManuscriptByChapterId {
    return this.queries.findManuscriptByChapterId.bind(this.queries) as typeof this.queries.findManuscriptByChapterId
  }
  get setChapterHold(): typeof this.commands.setChapterHold {
    return this.commands.setChapterHold.bind(this.commands) as typeof this.commands.setChapterHold
  }
  get unsetChapterHold(): typeof this.commands.unsetChapterHold {
    return this.commands.unsetChapterHold.bind(this.commands) as typeof this.commands.unsetChapterHold
  }
  get findSeriesRecipients(): typeof this.queries.findSeriesRecipients {
    return this.queries.findSeriesRecipients.bind(this.queries) as typeof this.queries.findSeriesRecipients
  }
  get findChaptersNearDeadline(): typeof this.progressQueries.findChaptersNearDeadline {
    return this.progressQueries.findChaptersNearDeadline.bind(
      this.progressQueries
    ) as typeof this.progressQueries.findChaptersNearDeadline
  }
  get countPagesByStatus(): typeof this.progressQueries.countPagesByStatus {
    return this.progressQueries.countPagesByStatus.bind(
      this.progressQueries
    ) as typeof this.progressQueries.countPagesByStatus
  }
  get countTasksByStatusForChapter(): typeof this.progressQueries.countTasksByStatusForChapter {
    return this.progressQueries.countTasksByStatusForChapter.bind(
      this.progressQueries
    ) as typeof this.progressQueries.countTasksByStatusForChapter
  }
  get findNameStatus(): typeof this.queries.findNameStatus {
    return this.queries.findNameStatus.bind(this.queries) as typeof this.queries.findNameStatus
  }
  get findActiveChaptersForMangaka(): typeof this.progressQueries.findActiveChaptersForMangaka {
    return this.progressQueries.findActiveChaptersForMangaka.bind(
      this.progressQueries
    ) as typeof this.progressQueries.findActiveChaptersForMangaka
  }
  get findActiveChaptersForEditor(): typeof this.progressQueries.findActiveChaptersForEditor {
    return this.progressQueries.findActiveChaptersForEditor.bind(
      this.progressQueries
    ) as typeof this.progressQueries.findActiveChaptersForEditor
  }
  get groupPagesByChapter(): typeof this.progressQueries.groupPagesByChapter {
    return this.progressQueries.groupPagesByChapter.bind(
      this.progressQueries
    ) as typeof this.progressQueries.groupPagesByChapter
  }
  get groupTasksByChapter(): typeof this.progressQueries.groupTasksByChapter {
    return this.progressQueries.groupTasksByChapter.bind(
      this.progressQueries
    ) as typeof this.progressQueries.groupTasksByChapter
  }
  get groupTasksByPageForChapter(): typeof this.progressQueries.groupTasksByPageForChapter {
    return this.progressQueries.groupTasksByPageForChapter.bind(
      this.progressQueries
    ) as typeof this.progressQueries.groupTasksByPageForChapter
  }
  get groupTasksByPageForChapters(): typeof this.progressQueries.groupTasksByPageForChapters {
    return this.progressQueries.groupTasksByPageForChapters.bind(
      this.progressQueries
    ) as typeof this.progressQueries.groupTasksByPageForChapters
  }
  get findTasksNearDeadline(): typeof this.progressQueries.findTasksNearDeadline {
    return this.progressQueries.findTasksNearDeadline.bind(
      this.progressQueries
    ) as typeof this.progressQueries.findTasksNearDeadline
  }
  get deleteChapterCascade(): typeof this.commands.deleteChapterCascade {
    return this.commands.deleteChapterCascade.bind(this.commands) as typeof this.commands.deleteChapterCascade
  }
  get applyManuscriptTransition(): typeof this.commands.applyManuscriptTransition {
    return this.commands.applyManuscriptTransition.bind(this.commands) as typeof this.commands.applyManuscriptTransition
  }
  get findScheduleByChapterId(): typeof this.queries.findScheduleByChapterId {
    return this.queries.findScheduleByChapterId.bind(this.queries) as typeof this.queries.findScheduleByChapterId
  }
  get updateSchedule(): typeof this.commands.updateSchedule {
    return this.commands.updateSchedule.bind(this.commands) as typeof this.commands.updateSchedule
  }
  get extendSchedule(): typeof this.commands.extendSchedule {
    return this.commands.extendSchedule.bind(this.commands) as typeof this.commands.extendSchedule
  }
  get createPage(): typeof this.commands.createPage {
    return this.commands.createPage.bind(this.commands) as typeof this.commands.createPage
  }
  get findPageById(): typeof this.queries.findPageById {
    return this.queries.findPageById.bind(this.queries) as typeof this.queries.findPageById
  }
  get findPagesByChapterId(): typeof this.queries.findPagesByChapterId {
    return this.queries.findPagesByChapterId.bind(this.queries) as typeof this.queries.findPagesByChapterId
  }
  get findPageByChapterAndNumber(): typeof this.queries.findPageByChapterAndNumber {
    return this.queries.findPageByChapterAndNumber.bind(this.queries) as typeof this.queries.findPageByChapterAndNumber
  }
  get countPagesNotCompleted(): typeof this.queries.countPagesNotCompleted {
    return this.queries.countPagesNotCompleted.bind(this.queries) as typeof this.queries.countPagesNotCompleted
  }
  get findPagesByIds(): typeof this.queries.findPagesByIds {
    return this.queries.findPagesByIds.bind(this.queries) as typeof this.queries.findPagesByIds
  }
  get findTasksByPage(): typeof this.queries.findTasksByPage {
    return this.queries.findTasksByPage.bind(this.queries) as typeof this.queries.findTasksByPage
  }
  get findTasksByPages(): typeof this.queries.findTasksByPages {
    return this.queries.findTasksByPages.bind(this.queries) as typeof this.queries.findTasksByPages
  }
  get deletePagesCascade(): typeof this.commands.deletePagesCascade {
    return this.commands.deletePagesCascade.bind(this.commands) as typeof this.commands.deletePagesCascade
  }
  get deletePageCascade(): typeof this.commands.deletePageCascade {
    return this.commands.deletePageCascade.bind(this.commands) as typeof this.commands.deletePageCascade
  }
  get updatePage(): typeof this.commands.updatePage {
    return this.commands.updatePage.bind(this.commands) as typeof this.commands.updatePage
  }
  get updatePageStatus(): typeof this.commands.updatePageStatus {
    return this.commands.updatePageStatus.bind(this.commands) as typeof this.commands.updatePageStatus
  }
  get createCoOwnerApproval(): typeof this.commands.createCoOwnerApproval {
    return this.commands.createCoOwnerApproval.bind(this.commands) as typeof this.commands.createCoOwnerApproval
  }
  get findCoOwnerApprovalByChapterId(): typeof this.queries.findCoOwnerApprovalByChapterId {
    return this.queries.findCoOwnerApprovalByChapterId.bind(
      this.queries
    ) as typeof this.queries.findCoOwnerApprovalByChapterId
  }
  get updateCoOwnerApproval(): typeof this.commands.updateCoOwnerApproval {
    return this.commands.updateCoOwnerApproval.bind(this.commands) as typeof this.commands.updateCoOwnerApproval
  }
  get findOverdueCoOwnerApprovals(): typeof this.queries.findOverdueCoOwnerApprovals {
    return this.queries.findOverdueCoOwnerApprovals.bind(
      this.queries
    ) as typeof this.queries.findOverdueCoOwnerApprovals
  }
  get findBoardMemberIds(): typeof this.queries.findBoardMemberIds {
    return this.queries.findBoardMemberIds.bind(this.queries) as typeof this.queries.findBoardMemberIds
  }
}
