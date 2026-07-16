import { Injectable } from '@nestjs/common'
import envConfig from 'src/core/config/envConfig'
import { StorageService } from 'src/infrastructure/storage/storage.service'
import { PublicChapterNotFoundException, PublicSeriesNotFoundException } from './errors/public.errors'
import { OBJECT_ID_RE } from './public.constant'
import { mapPublicChapter, mapPublicSeriesItem } from './public.mapper'
import { PublicRepository } from './public.repo'
import type { PublicSeriesListQueryType } from './schemas/public-schemas'

@Injectable()
export class PublicService {
  constructor(
    private readonly publicRepository: PublicRepository,
    private readonly storageService: StorageService
  ) {}

  private signCover(key: string | null): Promise<string | null> {
    if (!key) return Promise.resolve(null)
    return this.storageService
      .createPresignedDownload(key, envConfig.PUBLIC_SIGN_TTL_SECONDS)
      .then((result) => result.downloadUrl)
  }

  async listSeries(query: PublicSeriesListQueryType) {
    const { items, total } = await this.publicRepository.findPublicSeries({
      q: query.q,
      genre: query.genre,
      demographic: query.demographic,
      publicationType: query.publicationType,
      limit: query.limit,
      offset: query.offset
    })
    const counts = await this.publicRepository.countPublishedChaptersBySeriesIds(items.map((series) => series.id))
    const mapped = await Promise.all(
      items.map(async (series) =>
        mapPublicSeriesItem(series, await this.signCover(series.coverImage), counts.get(series.id) ?? 0)
      )
    )

    return { items: mapped, total, limit: query.limit, offset: query.offset }
  }

  async getSeriesDetail(id: string) {
    if (!OBJECT_ID_RE.test(id)) throw PublicSeriesNotFoundException
    const series = await this.publicRepository.findPublicSeriesById(id)
    if (!series) throw PublicSeriesNotFoundException

    const [counts, chapters, coverImageUrl] = await Promise.all([
      this.publicRepository.countPublishedChaptersBySeriesIds([series.id]),
      this.publicRepository.findPublishedChaptersBySeriesId(series.id),
      this.signCover(series.coverImage)
    ])

    return {
      ...mapPublicSeriesItem(series, coverImageUrl, counts.get(series.id) ?? 0),
      chapters: chapters.map(mapPublicChapter)
    }
  }

  async getChapterPages(id: string) {
    if (!OBJECT_ID_RE.test(id)) throw PublicChapterNotFoundException
    const chapter = await this.publicRepository.findPublishedChapterById(id)
    if (!chapter) throw PublicChapterNotFoundException

    const series = await this.publicRepository.findPublicSeriesById(chapter.seriesId)
    if (!series) throw PublicChapterNotFoundException

    const [pagesRaw, previousChapter, nextChapter] = await Promise.all([
      this.publicRepository.findPagesByChapterId(chapter.id),
      this.publicRepository.findAdjacentPublishedChapter(chapter.seriesId, chapter.chapterNumber, 'prev'),
      this.publicRepository.findAdjacentPublishedChapter(chapter.seriesId, chapter.chapterNumber, 'next')
    ])
    const pages = await Promise.all(
      pagesRaw
        .filter((page): page is { pageNumber: number; originalFile: string } => page.originalFile != null)
        .map(async (page) => ({
          pageNumber: page.pageNumber,
          imageUrl: await this.storageService
            .createPresignedDownload(page.originalFile, envConfig.PUBLIC_SIGN_TTL_SECONDS)
            .then((result) => result.downloadUrl)
        }))
    )

    return {
      series: { id: series.id, title: series.title },
      chapter: mapPublicChapter(chapter),
      pages,
      prevChapterId: previousChapter?.id ?? null,
      nextChapterId: nextChapter?.id ?? null
    }
  }
}
