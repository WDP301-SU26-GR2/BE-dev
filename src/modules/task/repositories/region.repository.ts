import { Prisma, Region, Task, TaskStatus } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

export class RegionRepository {
  constructor(private readonly prisma: PrismaService) {}

  createRegion(data: {
    pageId: string
    coordinates: Prisma.InputJsonValue
    regionType: Region['regionType']
  }): Promise<Region> {
    return this.prisma.region.create({
      data: {
        ...data,
        createdBy: 'MANUAL',
        confirmedByMangaka: true,
        confidenceScore: null
      }
    })
  }

  findRegionById(id: string) {
    return this.prisma.region.findUnique({ where: { id } })
  }

  updateRegion(
    id: string,
    data: { coordinates?: Prisma.InputJsonValue; regionType?: Region['regionType']; confirmedByMangaka?: boolean }
  ) {
    return this.prisma.region.update({ where: { id }, data })
  }

  async deleteRegion(id: string) {
    await this.prisma.region.delete({ where: { id } })
  }

  listRegionsByPage(pageId: string) {
    return this.prisma.region.findMany({ where: { pageId } })
  }

  countTasksByRegion(regionId: string) {
    return this.prisma.task.count({ where: { regionIds: { has: regionId } } })
  }

  findTasksByRegion(regionId: string): Promise<Array<Pick<Task, 'id' | 'status' | 'assistantId'>>> {
    return this.prisma.task.findMany({
      where: { regionIds: { has: regionId } },
      select: { id: true, status: true, assistantId: true }
    })
  }

  findRegionsByIds(ids: string[]): Promise<Array<Pick<Region, 'id' | 'pageId'>>> {
    if (ids.length === 0) return Promise.resolve([])
    return this.prisma.region.findMany({ where: { id: { in: ids } }, select: { id: true, pageId: true } })
  }

  async cancelTasksAndDeleteRegion(regionId: string, taskIds: string[], statusReason: string) {
    await this.prisma.$transaction([
      this.prisma.task.updateMany({
        where: { id: { in: taskIds } },
        data: { status: TaskStatus.CANCELLED, statusReason }
      }),
      this.prisma.region.delete({ where: { id: regionId } })
    ])
  }

  findAiRegionsByPage(pageId: string) {
    return this.prisma.region.findMany({ where: { pageId, createdBy: 'AI' } })
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
  ) {
    await this.prisma.$transaction([
      this.prisma.region.deleteMany({ where: { id: { in: deletableIds } } }),
      this.prisma.region.createMany({
        data: regions.map((region) => ({
          pageId,
          ...region,
          createdBy: 'AI',
          confirmedByMangaka: false,
          aiModelVersion: meta.aiModelVersion
        }))
      })
    ])
    return regions.length
  }
}
