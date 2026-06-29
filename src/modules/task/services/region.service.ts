import { Injectable } from '@nestjs/common'
import {
  NotSeriesOwnerException,
  PageNotFoundException,
  RegionHasTasksException,
  RegionNotFoundException
} from '../errors/task.errors'
import { TaskRepository } from '../task.repo'
import { toRegionRes } from '../task.mapper'
import { CreateRegionBodyType, UpdateRegionBodyType } from '../schemas/task-schemas'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class RegionService {
  constructor(private readonly taskRepository: TaskRepository) {}

  private async requirePageOwner(mangakaId: string, pageId: string) {
    if (!OBJECT_ID_RE.test(pageId)) throw PageNotFoundException
    const page = await this.taskRepository.findPageWithOwner(pageId)
    if (!page) throw PageNotFoundException
    if (page.chapter.series.mangakaId !== mangakaId) throw NotSeriesOwnerException
    return page
  }

  async create(mangakaId: string, pageId: string, body: CreateRegionBodyType) {
    await this.requirePageOwner(mangakaId, pageId)
    const region = await this.taskRepository.createRegion({
      pageId,
      coordinates: body.coordinates,
      regionType: body.regionType ?? null
    })
    return toRegionRes(region)
  }

  async listByPage(mangakaId: string, pageId: string) {
    await this.requirePageOwner(mangakaId, pageId)
    const rows = await this.taskRepository.listRegionsByPage(pageId)
    return { items: rows.map(toRegionRes) }
  }

  private async requireRegionOwner(mangakaId: string, regionId: string) {
    if (!OBJECT_ID_RE.test(regionId)) throw RegionNotFoundException
    const region = await this.taskRepository.findRegionById(regionId)
    if (!region) throw RegionNotFoundException
    await this.requirePageOwner(mangakaId, region.pageId)
    return region
  }

  async update(mangakaId: string, regionId: string, body: UpdateRegionBodyType) {
    await this.requireRegionOwner(mangakaId, regionId)
    const data: {
      coordinates?: CreateRegionBodyType['coordinates']
      regionType?: UpdateRegionBodyType['regionType']
      confirmedByMangaka?: boolean
    } = {}
    if (body.coordinates != null) data.coordinates = body.coordinates
    if (body.regionType != null) data.regionType = body.regionType
    if (body.confirmedByMangaka != null) data.confirmedByMangaka = body.confirmedByMangaka
    const updated = await this.taskRepository.updateRegion(regionId, data)
    return toRegionRes(updated)
  }

  async remove(mangakaId: string, regionId: string) {
    await this.requireRegionOwner(mangakaId, regionId)
    const count = await this.taskRepository.countTasksByRegion(regionId)
    if (count > 0) throw RegionHasTasksException
    await this.taskRepository.deleteRegion(regionId)
    return { message: 'Region deleted' }
  }
}
