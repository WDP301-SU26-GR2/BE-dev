import { Injectable } from '@nestjs/common'
import { Prisma, Region, Specialization, Task, TaskStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { fetchUserMiniMap } from 'src/core/models/user-mini.model'

export type TaskListWhere = Prisma.TaskWhereInput

@Injectable()
export class TaskRepository {
  constructor(private readonly prismaService: PrismaService) {}

  // Batch lookup vùng cho task theo Region — Assistant cần toạ độ để biết chỗ phải làm,
  // mà GET /pages/:id/regions là MANGAKA/EDITOR-only. 1 query cho cả trang, không N+1.
  private async fetchRegionMap(regionIds: Array<string | null>) {
    const ids = [...new Set(regionIds.filter((id): id is string => Boolean(id)))]
    if (ids.length === 0) return new Map<string, Region>()
    const regions = await this.prismaService.region.findMany({ where: { id: { in: ids } } })
    return new Map(regions.map((region) => [region.id, region]))
  }

  private async attachEmbeds<T extends Pick<Task, 'assistantId' | 'regionId' | 'versions'>>(rows: T[]) {
    const [users, regions] = await Promise.all([
      fetchUserMiniMap(
        this.prismaService,
        rows.flatMap((row) => [row.assistantId, ...row.versions.map((version) => version.submittedBy)])
      ),
      this.fetchRegionMap(rows.map((row) => row.regionId))
    ])
    return rows.map((row) => ({
      ...row,
      assistant: row.assistantId ? (users.get(row.assistantId) ?? null) : null,
      region: row.regionId ? (regions.get(row.regionId) ?? null) : null,
      versions: row.versions.map((version) => ({
        ...version,
        submitter: version.submittedBy ? (users.get(version.submittedBy) ?? null) : null
      }))
    }))
  }

  // ---- Read-only precondition (KHÔNG ghi status A3) ----
  async findPageWithOwner(pageId: string) {
    return await this.prismaService.page.findUnique({
      where: { id: pageId },
      select: {
        id: true,
        chapterId: true,
        status: true,
        originalFile: true,
        chapter: { select: { seriesId: true, hold: true, series: { select: { mangakaId: true } } } }
      }
    })
  }

  // ---- Region (A-TSK-01/02) ----
  async createRegion(data: {
    pageId: string
    coordinates: Prisma.InputJsonValue
    regionType: Region['regionType']
  }): Promise<Region> {
    return await this.prismaService.region.create({
      data: {
        pageId: data.pageId,
        coordinates: data.coordinates,
        regionType: data.regionType,
        createdBy: 'MANUAL',
        confirmedByMangaka: true,
        confidenceScore: null
      }
    })
  }

  async findRegionById(id: string): Promise<Region | null> {
    return await this.prismaService.region.findUnique({ where: { id } })
  }

  async updateRegion(
    id: string,
    data: { coordinates?: Prisma.InputJsonValue; regionType?: Region['regionType']; confirmedByMangaka?: boolean }
  ): Promise<Region> {
    return await this.prismaService.region.update({ where: { id }, data })
  }

  async deleteRegion(id: string): Promise<void> {
    await this.prismaService.region.delete({ where: { id } })
  }

  async listRegionsByPage(pageId: string): Promise<Region[]> {
    return await this.prismaService.region.findMany({ where: { pageId } })
  }

  async countTasksByRegion(regionId: string): Promise<number> {
    return await this.prismaService.task.count({ where: { regionId } })
  }

  async findTasksByRegion(regionId: string): Promise<Array<Pick<Task, 'id' | 'status' | 'assistantId'>>> {
    return await this.prismaService.task.findMany({
      where: { regionId },
      select: { id: true, status: true, assistantId: true }
    })
  }

  async cancelTasksAndDeleteRegion(regionId: string, taskIds: string[], statusReason: string): Promise<void> {
    await this.prismaService.$transaction([
      this.prismaService.task.updateMany({
        where: { id: { in: taskIds } },
        data: { status: TaskStatus.CANCELLED, statusReason }
      }),
      this.prismaService.region.delete({ where: { id: regionId } })
    ])
  }

  async findAiRegionsByPage(pageId: string): Promise<Region[]> {
    return await this.prismaService.region.findMany({ where: { pageId, createdBy: 'AI' } })
  }

  async replaceAiRegions(
    pageId: string,
    deletableIds: string[],
    regions: {
      regionType: Region['regionType']
      detectedSubtype: string | null
      coordinates: Prisma.InputJsonValue
      confidenceScore: number
    }[],
    meta: { aiModelVersion: string | null }
  ): Promise<number> {
    await this.prismaService.$transaction([
      this.prismaService.region.deleteMany({ where: { id: { in: deletableIds } } }),
      this.prismaService.region.createMany({
        data: regions.map((r) => ({
          pageId,
          coordinates: r.coordinates,
          regionType: r.regionType,
          detectedSubtype: r.detectedSubtype,
          createdBy: 'AI',
          confirmedByMangaka: false,
          confidenceScore: r.confidenceScore,
          aiModelVersion: meta.aiModelVersion
        }))
      })
    ])
    return regions.length
  }

  // ---- Task (A-TSK-03/04/05/09) ----
  async createTask(data: {
    pageId: string
    regionId: string | null
    assistantId: string
    taskType: Specialization
    deadline: Date | null
    priority: number
    assetIds: string[]
  }): Promise<Task> {
    return await this.prismaService.task.create({ data: { ...data, status: 'ASSIGNED' } })
  }

  async createTasksBatch(
    items: Array<{
      pageId: string
      regionId: string | null
      assistantId: string
      taskType: Specialization
      deadline: Date | null
      priority: number
      assetIds: string[]
    }>
  ): Promise<Task[]> {
    return await this.prismaService.$transaction(
      items.map((d) => this.prismaService.task.create({ data: { ...d, status: 'ASSIGNED' } }))
    )
  }

  async findTaskById(id: string) {
    const row = await this.prismaService.task.findUnique({ where: { id } })
    if (!row) return null
    return (await this.attachEmbeds([row]))[0]
  }

  // single-writer status (gọi từ TaskStateService)
  async updateTaskStatus(id: string, status: TaskStatus, statusReason?: string): Promise<Task> {
    return await this.prismaService.task.update({
      where: { id },
      data: { status, ...(statusReason !== undefined ? { statusReason } : {}) }
    })
  }

  // partial-update fields (assetIds/deadline/priority); chỉ ghi khi != undefined
  async updateTaskFields(
    id: string,
    data: { assetIds?: string[]; deadline?: Date | null; priority?: number }
  ): Promise<Task> {
    return await this.prismaService.task.update({ where: { id }, data })
  }

  async setAssistant(id: string, assistantId: string): Promise<Task> {
    return await this.prismaService.task.update({ where: { id }, data: { assistantId } })
  }

  async pushTaskVersion(
    id: string,
    version: { submittedBy: string; versionNumber: number; file: string }
  ): Promise<Task> {
    return await this.prismaService.task.update({
      where: { id },
      data: { versions: { push: { ...version, reviewStatus: 'PENDING' } } }
    })
  }

  // set review của version mới nhất (read-modify-write toàn mảng — versions là list embedded)
  async setLatestVersionReview(
    id: string,
    review: { reviewStatus: 'APPROVED' | 'REVISION_REQUESTED'; reviewerNote: string | null }
  ): Promise<Task> {
    const task = await this.prismaService.task.findUnique({ where: { id }, select: { versions: true } })
    const versions = task?.versions ?? []
    if (versions.length === 0) return await this.prismaService.task.update({ where: { id }, data: {} })
    versions[versions.length - 1] = {
      ...versions[versions.length - 1],
      reviewStatus: review.reviewStatus,
      reviewerNote: review.reviewerNote
    }
    return await this.prismaService.task.update({ where: { id }, data: { versions: { set: versions } } })
  }

  async listTasks(where: TaskListWhere, page: { limit: number; offset: number }) {
    const rows = await this.prismaService.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: page.offset,
      take: page.limit
    })
    return this.attachEmbeds(rows)
  }

  async countTasks(where: TaskListWhere): Promise<number> {
    return await this.prismaService.task.count({ where })
  }

  // ---- Listener aggregations ----
  async findTasksByAssistantInStatuses(assistantId: string, statuses: TaskStatus[]): Promise<Task[]> {
    return await this.prismaService.task.findMany({ where: { assistantId, status: { in: statuses } } })
  }
}
