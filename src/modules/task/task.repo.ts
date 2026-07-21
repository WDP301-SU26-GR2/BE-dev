import { Injectable } from '@nestjs/common'
import { Asset, Prisma, Region, Specialization, Task, TaskStatus } from '@prisma/client'
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

  // Batch lookup Asset reference theo assetIds — Assistant cần object key (filePath) để tải ảnh reference
  // Mangaka đính khi giao task (assetIds chỉ là ObjectId, không phải key). 1 query/danh sách, không N+1.
  private async fetchAssetMap(assetIds: string[]) {
    const ids = [...new Set(assetIds)]
    if (ids.length === 0)
      return new Map<string, { id: string; filePath: string; name: string; assetType: Asset['assetType'] }>()
    const assets = await this.prismaService.asset.findMany({
      where: { id: { in: ids } },
      select: { id: true, filePath: true, name: true, assetType: true }
    })
    return new Map(assets.map((asset) => [asset.id, asset]))
  }

  // Batch key ảnh gốc/composite của trang theo pageId — màn review Mangaka cần bản gốc (Mangaka giao)
  // bên cạnh versions[].file (Assistant nộp) để so 2 ảnh. 1 query/trang, không N+1.
  private async fetchPageFileMap(pageIds: string[]) {
    const ids = [...new Set(pageIds)]
    if (ids.length === 0) return new Map<string, { originalFile: string | null; compositeFile: string | null }>()
    const pages = await this.prismaService.page.findMany({
      where: { id: { in: ids } },
      select: { id: true, originalFile: true, compositeFile: true }
    })
    return new Map(
      pages.map((page) => [page.id, { originalFile: page.originalFile, compositeFile: page.compositeFile }])
    )
  }

  private async attachEmbeds<
    T extends Pick<Task, 'assistantId' | 'regionIds' | 'versions' | 'pageId' | 'assetIds'>
  >(rows: T[]) {
    const [users, regions, pageFiles, assets] = await Promise.all([
      fetchUserMiniMap(
        this.prismaService,
        rows.flatMap((row) => [row.assistantId, ...row.versions.map((version) => version.submittedBy)])
      ),
      this.fetchRegionMap(rows.flatMap((row) => row.regionIds)),
      this.fetchPageFileMap(rows.map((row) => row.pageId)),
      this.fetchAssetMap(rows.flatMap((row) => row.assetIds))
    ])
    return rows.map((row) => {
      const page = pageFiles.get(row.pageId)
      return {
        ...row,
        assistant: row.assistantId ? (users.get(row.assistantId) ?? null) : null,
        // Task 1 trang → trả các vùng đã chọn; task nhóm có regionIds=[] → regions=[] (chỉ hiển thị theo trang).
        regions: row.regionIds.map((id) => regions.get(id)).filter((r): r is Region => Boolean(r)),
        // assets = ref Mangaka đính khi giao task: FE dùng filePath làm `key` cho POST /tasks/:id/download-url.
        assets: row.assetIds.map((id) => assets.get(id)).filter((a): a is NonNullable<typeof a> => Boolean(a)),
        pageOriginalFile: page?.originalFile ?? null,
        // displayFile = composite ?? original (cùng công thức PageRes.displayFile) — ảnh nên hiển thị.
        pageDisplayFile: page ? (page.compositeFile ?? page.originalFile) : null,
        versions: row.versions.map((version) => ({
          ...version,
          submitter: version.submittedBy ? (users.get(version.submittedBy) ?? null) : null
        }))
      }
    })
  }

  // Task-scoped download (task-media.service): task (versions + assignee) + ảnh trang + chủ series/editor.
  // Task KHÔNG có relation tới Page (pageId scalar) → 2 query.
  async findTaskDownloadContext(taskId: string) {
    const task = await this.prismaService.task.findUnique({
      where: { id: taskId },
      select: { id: true, pageId: true, assistantId: true, assetIds: true, versions: true }
    })
    if (!task) return null
    const [page, assets] = await Promise.all([
      this.prismaService.page.findUnique({
        where: { id: task.pageId },
        select: {
          originalFile: true,
          compositeFile: true,
          chapter: { select: { series: { select: { mangakaId: true, editorId: true } } } }
        }
      }),
      task.assetIds.length > 0
        ? this.prismaService.asset.findMany({ where: { id: { in: task.assetIds } }, select: { filePath: true } })
        : Promise.resolve([])
    ])
    // assetKeys = object key của ảnh reference Mangaka đính lúc giao task (A-TSK-09) → Assistant tải được.
    return { task, page, assetKeys: assets.map((a) => a.filePath) }
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

  // Task chỉ có `pageId` scalar (KHÔNG có relation field tới Page) nên Prisma không
  // filter xuyên quan hệ được → phải resolve tập pageId theo scope rồi dùng `pageId: { in }`
  // (`@@index([pageId])` đỡ được truy vấn này).
  // mangakaId != null ⇒ chỉ lấy trang thuộc series của Mangaka đó (authz).
  async findOwnedPageIds(
    mangakaId: string | undefined,
    filter: { seriesId?: string; chapterId?: string }
  ): Promise<string[]> {
    let chapterIds: string[]

    if (filter.chapterId) {
      const chapter = await this.prismaService.chapter.findUnique({
        where: { id: filter.chapterId },
        select: { id: true, series: { select: { mangakaId: true } } }
      })
      if (!chapter) return []
      if (mangakaId && chapter.series.mangakaId !== mangakaId) return []
      chapterIds = [chapter.id]
    } else {
      const seriesRows = await this.prismaService.series.findMany({
        where: {
          ...(mangakaId ? { mangakaId } : {}),
          ...(filter.seriesId ? { id: filter.seriesId } : {})
        },
        select: { id: true }
      })
      if (seriesRows.length === 0) return []
      const chapters = await this.prismaService.chapter.findMany({
        where: { seriesId: { in: seriesRows.map((row) => row.id) } },
        select: { id: true }
      })
      if (chapters.length === 0) return []
      chapterIds = chapters.map((chapter) => chapter.id)
    }

    const pages = await this.prismaService.page.findMany({
      where: { chapterId: { in: chapterIds } },
      select: { id: true }
    })
    return pages.map((page) => page.id)
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
    return await this.prismaService.task.count({ where: { regionIds: { has: regionId } } })
  }

  async findTasksByRegion(regionId: string): Promise<Array<Pick<Task, 'id' | 'status' | 'assistantId'>>> {
    return await this.prismaService.task.findMany({
      where: { regionIds: { has: regionId } },
      select: { id: true, status: true, assistantId: true }
    })
  }

  // Validate vùng khi tạo task: mọi regionId phải tồn tại và cùng thuộc pageId.
  async findRegionsByIds(ids: string[]): Promise<Array<Pick<Region, 'id' | 'pageId'>>> {
    if (ids.length === 0) return []
    return await this.prismaService.region.findMany({
      where: { id: { in: ids } },
      select: { id: true, pageId: true }
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
    regionIds: string[]
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
      regionIds: string[]
      assistantId: string
      taskType: Specialization
      deadline: Date | null
      priority: number
      assetIds: string[]
      groupId?: string | null
      groupTitle?: string | null
    }>
  ): Promise<Task[]> {
    return await this.prismaService.$transaction(
      items.map((d) => this.prismaService.task.create({ data: { ...d, status: 'ASSIGNED' } }))
    )
  }

  async findTasksByGroup(groupId: string) {
    return await this.prismaService.task.findMany({
      where: { groupId },
      select: { id: true, status: true, pageId: true }
    })
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
