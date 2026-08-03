import { Injectable } from '@nestjs/common'
import { SeriesContext, SeriesContextPort } from 'src/modules/series-request/ports/series-context.port'
import { SeriesRepository } from '../series.repo'

// Module series bind năng lực công khai cho series-request; repository vẫn nằm trong module này.
@Injectable()
export class SeriesRequestContextAdapter implements SeriesContextPort {
  constructor(private readonly seriesRepository: SeriesRepository) {}

  async findById(seriesId: string): Promise<SeriesContext | null> {
    const series = await this.seriesRepository.findById(seriesId)
    if (!series) return null
    return {
      id: series.id,
      mangakaId: series.mangakaId,
      editorId: series.editorId ?? null,
      status: series.status
    }
  }

  findSeriesIdsByOwner(key: 'mangakaId' | 'editorId', userId: string): Promise<string[]> {
    return this.seriesRepository.findSeriesIdsByOwner(key, userId)
  }
}
