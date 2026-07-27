import { AiSegmentSource, Asset, Region, Task } from '@prisma/client'
import { fetchUserMiniMap } from 'src/core/models/user-mini.model'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

export class TaskHydrationRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async fetchRegionMap(regionIds: Array<string | null>) {
    const ids = [...new Set(regionIds.filter((id): id is string => Boolean(id)))]
    if (ids.length === 0) return new Map<string, Region>()
    const regions = await this.prisma.region.findMany({ where: { id: { in: ids } } })
    return new Map(regions.map((region) => [region.id, region]))
  }

  private async fetchAssetMap(assetIds: string[]) {
    const ids = [...new Set(assetIds)]
    if (ids.length === 0)
      return new Map<string, { id: string; filePath: string; name: string; assetType: Asset['assetType'] }>()
    const assets = await this.prisma.asset.findMany({
      where: { id: { in: ids } },
      select: { id: true, filePath: true, name: true, assetType: true }
    })
    return new Map(assets.map((asset) => [asset.id, asset]))
  }

  private async fetchPageFileMap(pageIds: string[]) {
    const ids = [...new Set(pageIds)]
    if (ids.length === 0) return new Map<string, { originalFile: string | null; compositeFile: string | null }>()
    const pages = await this.prisma.page.findMany({
      where: { id: { in: ids } },
      select: { id: true, originalFile: true, compositeFile: true }
    })
    return new Map(pages.map((page) => [page.id, page]))
  }

  private async fetchStageInputMap(rows: Array<Pick<Task, 'stageId' | 'pageId'>>) {
    const pairs = [
      ...new Map(rows.filter((row) => row.stageId).map((row) => [`${row.stageId}:${row.pageId}`, row])).values()
    ]
    if (pairs.length === 0)
      return new Map<string, { inputFileKey: string; inputSourceType: AiSegmentSource; inputRevision: number }>()
    const stagePages = await this.prisma.productionStagePage.findMany({
      where: { OR: pairs.map((pair) => ({ stageId: pair.stageId as string, pageId: pair.pageId })) },
      select: { stageId: true, pageId: true, inputFileKey: true, inputSourceType: true, inputRevision: true }
    })
    return new Map(
      stagePages.map((page) => [
        `${page.stageId}:${page.pageId}`,
        {
          inputFileKey: page.inputFileKey,
          inputSourceType: page.inputSourceType,
          inputRevision: page.inputRevision
        }
      ])
    )
  }

  async attachEmbeds<
    T extends Pick<Task, 'assistantId' | 'regionIds' | 'versions' | 'pageId' | 'assetIds' | 'stageId'>
  >(rows: T[]) {
    const [users, regions, pageFiles, assets, stageInputs] = await Promise.all([
      fetchUserMiniMap(
        this.prisma,
        rows.flatMap((row) => [row.assistantId, ...row.versions.map((version) => version.submittedBy)])
      ),
      this.fetchRegionMap(rows.flatMap((row) => row.regionIds)),
      this.fetchPageFileMap(rows.map((row) => row.pageId)),
      this.fetchAssetMap(rows.flatMap((row) => row.assetIds)),
      this.fetchStageInputMap(rows)
    ])
    return rows.map((row) => {
      const page = pageFiles.get(row.pageId)
      const stageInput = row.stageId ? stageInputs.get(`${row.stageId}:${row.pageId}`) : undefined
      return {
        ...row,
        assistant: row.assistantId ? (users.get(row.assistantId) ?? null) : null,
        regions: row.regionIds.map((id) => regions.get(id)).filter((region): region is Region => Boolean(region)),
        assets: row.assetIds
          .map((id) => assets.get(id))
          .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset)),
        pageOriginalFile: page?.originalFile ?? null,
        pageDisplayFile: page ? (page.compositeFile ?? page.originalFile) : null,
        stageInputFile: stageInput?.inputFileKey ?? null,
        stageInputSourceType: stageInput?.inputSourceType ?? null,
        stageInputRevision: stageInput?.inputRevision ?? null,
        versions: row.versions.map((version) => ({
          ...version,
          submitter: version.submittedBy ? (users.get(version.submittedBy) ?? null) : null
        }))
      }
    })
  }

  async attachListEmbeds<T extends Pick<Task, 'assistantId' | 'regionIds' | 'pageId'>>(rows: T[]) {
    const [users, regions, pageFiles] = await Promise.all([
      fetchUserMiniMap(
        this.prisma,
        rows.map((row) => row.assistantId)
      ),
      this.fetchRegionMap(rows.flatMap((row) => row.regionIds)),
      this.fetchPageFileMap(rows.map((row) => row.pageId))
    ])

    return rows.map((row) => {
      const page = pageFiles.get(row.pageId)
      return {
        ...row,
        assistant: row.assistantId ? (users.get(row.assistantId) ?? null) : null,
        regions: row.regionIds.map((id) => regions.get(id)).filter((region): region is Region => Boolean(region)),
        pageDisplayFile: page ? (page.compositeFile ?? page.originalFile) : null
      }
    })
  }
}
