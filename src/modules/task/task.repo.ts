import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { RegionRepository } from './repositories/region.repository'
import { TaskCommandRepository } from './repositories/task-command.repository'
import { TaskHydrationRepository } from './repositories/task-hydration.repository'
import { TaskQueryRepository } from './repositories/task-query.repository'

export type TaskListWhere = Prisma.TaskWhereInput

@Injectable()
export class TaskRepository {
  private readonly hydration: TaskHydrationRepository
  private readonly queries: TaskQueryRepository
  private readonly commands: TaskCommandRepository
  private readonly regions: RegionRepository

  constructor(private readonly prisma: PrismaService) {
    this.hydration = new TaskHydrationRepository(prisma)
    this.queries = new TaskQueryRepository(prisma, this.hydration)
    this.commands = new TaskCommandRepository(prisma, this.hydration)
    this.regions = new RegionRepository(prisma)
  }

  get findTaskDownloadContext(): typeof this.queries.findTaskDownloadContext {
    return this.queries.findTaskDownloadContext.bind(this.queries) as typeof this.queries.findTaskDownloadContext
  }
  get findPageWithOwner(): typeof this.queries.findPageWithOwner {
    return this.queries.findPageWithOwner.bind(this.queries) as typeof this.queries.findPageWithOwner
  }
  get findOwnedPageIds(): typeof this.queries.findOwnedPageIds {
    return this.queries.findOwnedPageIds.bind(this.queries) as typeof this.queries.findOwnedPageIds
  }
  get createRegion(): typeof this.regions.createRegion {
    return this.regions.createRegion.bind(this.regions) as typeof this.regions.createRegion
  }
  get findRegionById(): typeof this.regions.findRegionById {
    return this.regions.findRegionById.bind(this.regions) as typeof this.regions.findRegionById
  }
  get updateRegion(): typeof this.regions.updateRegion {
    return this.regions.updateRegion.bind(this.regions) as typeof this.regions.updateRegion
  }
  get deleteRegion(): typeof this.regions.deleteRegion {
    return this.regions.deleteRegion.bind(this.regions) as typeof this.regions.deleteRegion
  }
  get listRegionsByPage(): typeof this.regions.listRegionsByPage {
    return this.regions.listRegionsByPage.bind(this.regions) as typeof this.regions.listRegionsByPage
  }
  get countTasksByRegion(): typeof this.regions.countTasksByRegion {
    return this.regions.countTasksByRegion.bind(this.regions) as typeof this.regions.countTasksByRegion
  }
  get findTasksByRegion(): typeof this.regions.findTasksByRegion {
    return this.regions.findTasksByRegion.bind(this.regions) as typeof this.regions.findTasksByRegion
  }
  get findRegionsByIds(): typeof this.regions.findRegionsByIds {
    return this.regions.findRegionsByIds.bind(this.regions) as typeof this.regions.findRegionsByIds
  }
  get cancelTasksAndDeleteRegion(): typeof this.regions.cancelTasksAndDeleteRegion {
    return this.regions.cancelTasksAndDeleteRegion.bind(this.regions) as typeof this.regions.cancelTasksAndDeleteRegion
  }
  get findAiRegionsByPage(): typeof this.regions.findAiRegionsByPage {
    return this.regions.findAiRegionsByPage.bind(this.regions) as typeof this.regions.findAiRegionsByPage
  }
  get replaceAiRegions(): typeof this.regions.replaceAiRegions {
    return this.regions.replaceAiRegions.bind(this.regions) as typeof this.regions.replaceAiRegions
  }
  get createTask(): typeof this.commands.createTask {
    return this.commands.createTask.bind(this.commands) as typeof this.commands.createTask
  }
  get createTasksBatch(): typeof this.commands.createTasksBatch {
    return this.commands.createTasksBatch.bind(this.commands) as typeof this.commands.createTasksBatch
  }
  get findTasksByGroup(): typeof this.queries.findTasksByGroup {
    return this.queries.findTasksByGroup.bind(this.queries) as typeof this.queries.findTasksByGroup
  }
  get findTaskById(): typeof this.queries.findTaskById {
    return this.queries.findTaskById.bind(this.queries) as typeof this.queries.findTaskById
  }
  get updateTaskStatus(): typeof this.commands.updateTaskStatus {
    return this.commands.updateTaskStatus.bind(this.commands) as typeof this.commands.updateTaskStatus
  }
  get updateTaskFields(): typeof this.commands.updateTaskFields {
    return this.commands.updateTaskFields.bind(this.commands) as typeof this.commands.updateTaskFields
  }
  get setStartedAtIfUnset(): typeof this.commands.setStartedAtIfUnset {
    return this.commands.setStartedAtIfUnset.bind(this.commands) as typeof this.commands.setStartedAtIfUnset
  }
  get setCompletedAt(): typeof this.commands.setCompletedAt {
    return this.commands.setCompletedAt.bind(this.commands) as typeof this.commands.setCompletedAt
  }
  get setAssistant(): typeof this.commands.setAssistant {
    return this.commands.setAssistant.bind(this.commands) as typeof this.commands.setAssistant
  }
  get pushTaskVersion(): typeof this.commands.pushTaskVersion {
    return this.commands.pushTaskVersion.bind(this.commands) as typeof this.commands.pushTaskVersion
  }
  get setLatestVersionReview(): typeof this.commands.setLatestVersionReview {
    return this.commands.setLatestVersionReview.bind(this.commands) as typeof this.commands.setLatestVersionReview
  }
  get listTasks(): typeof this.queries.listTasks {
    return this.queries.listTasks.bind(this.queries) as typeof this.queries.listTasks
  }
  get countTasks(): typeof this.queries.countTasks {
    return this.queries.countTasks.bind(this.queries) as typeof this.queries.countTasks
  }
  get findTasksByAssistantInStatuses(): typeof this.queries.findTasksByAssistantInStatuses {
    return this.queries.findTasksByAssistantInStatuses.bind(
      this.queries
    ) as typeof this.queries.findTasksByAssistantInStatuses
  }
  get findOverdueForCancel(): typeof this.queries.findOverdueForCancel {
    return this.queries.findOverdueForCancel.bind(this.queries) as typeof this.queries.findOverdueForCancel
  }
}
