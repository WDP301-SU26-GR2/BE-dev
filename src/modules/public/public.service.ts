import { Injectable } from '@nestjs/common'
import envConfig from 'src/core/config/envConfig'
import { PUB_SERIES_TTL_SEC } from 'src/infrastructure/redis/cache.constant'
import { CacheService } from 'src/infrastructure/redis/cache.service'
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
    private readonly storageService: StorageService,
    private readonly cacheService: CacheService
  ) {}

  private signCover(key: string | null): Promise<string | null> {
    if (!key) return Promise.resolve(null)
    return this.storageService
      .createPresignedDownload(key, envConfig.PUBLIC_SIGN_TTL_SECONDS)
      .then((result) => result.downloadUrl)
  }

  async listSeries(query: PublicSeriesListQueryType) {
    const load = async () => {
      const { items, total } = await this.publicRepository.findPublicSeries({
        q: query.q,
        genre: query.genre,
        demographic: query.demographic,
        publicationType: query.publicationType,
        limit: query.limit,
        offset: query.offset
      })
      const counts = await this.publicRepository.countPublishedChaptersBySeriesIds(items.map((series) => series.id))
      return {
        total,
        items: items.map((series) => ({
          ...mapPublicSeriesItem(series, null, counts.get(series.id) ?? 0),
          coverKey: series.coverImage ?? null
        }))
      }
    }
    const suffix = `list:${query.q ?? ''}:${query.genre ?? ''}:${query.demographic ?? ''}:${query.publicationType ?? ''}:${query.limit}`
    const data =
      query.offset === 0
        ? await this.cacheService.getOrSet('pubseries', suffix, PUB_SERIES_TTL_SEC, load)
        : await load()
    const mapped = await Promise.all(
      data.items.map(async ({ coverKey, ...item }) => ({ ...item, coverImageUrl: await this.signCover(coverKey) }))
    )

    return { items: mapped, total: data.total, limit: query.limit, offset: query.offset }
  }

  async getSeriesDetail(id: string) {
    if (!OBJECT_ID_RE.test(id)) throw PublicSeriesNotFoundException
    const data = await this.cacheService.getOrSet('pubseries', `detail:${id}`, PUB_SERIES_TTL_SEC, async () => {
      const series = await this.publicRepository.findPublicSeriesById(id)
      if (!series) throw PublicSeriesNotFoundException
      const [counts, chapters] = await Promise.all([
        this.publicRepository.countPublishedChaptersBySeriesIds([series.id]),
        this.publicRepository.findPublishedChaptersBySeriesId(series.id)
      ])
      return {
        base: { ...mapPublicSeriesItem(series, null, counts.get(series.id) ?? 0), coverKey: series.coverImage ?? null },
        chapters: chapters.map(mapPublicChapter)
      }
    })
    const { coverKey, ...base } = data.base

    return {
      ...base,
      coverImageUrl: await this.signCover(coverKey),
      chapters: data.chapters
    }
  }

  async getChapterPages(id: string) {
    if (!OBJECT_ID_RE.test(id)) throw PublicChapterNotFoundException
    const data = await this.cacheService.getOrSet('pubseries', `chapter:${id}`, PUB_SERIES_TTL_SEC, async () => {
      const chapter = await this.publicRepository.findPublishedChapterById(id)
      if (!chapter) throw PublicChapterNotFoundException
      const series = await this.publicRepository.findPublicSeriesById(chapter.seriesId)
      if (!series) throw PublicChapterNotFoundException
      const [pagesRaw, previousChapter, nextChapter] = await Promise.all([
        this.publicRepository.findPagesByChapterId(chapter.id),
        this.publicRepository.findAdjacentPublishedChapter(chapter.seriesId, chapter.chapterNumber, 'prev'),
        this.publicRepository.findAdjacentPublishedChapter(chapter.seriesId, chapter.chapterNumber, 'next')
      ])
      return {
        series: { id: series.id, title: series.title },
        chapter: mapPublicChapter(chapter),
        pages: pagesRaw
          .filter((page): page is { pageNumber: number; originalFile: string } => page.originalFile != null)
          .map((page) => ({ pageNumber: page.pageNumber, fileKey: page.originalFile })),
        prevChapterId: previousChapter?.id ?? null,
        nextChapterId: nextChapter?.id ?? null
      }
    })
    const pages = await Promise.all(
      data.pages.map(async (page) => ({
        pageNumber: page.pageNumber,
        imageUrl: await this.storageService
          .createPresignedDownload(page.fileKey, envConfig.PUBLIC_SIGN_TTL_SECONDS)
          .then((result) => result.downloadUrl)
      }))
    )

    return {
      series: data.series,
      chapter: data.chapter,
      pages,
      prevChapterId: data.prevChapterId,
      nextChapterId: data.nextChapterId
    }
  }
}
