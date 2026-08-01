import { Demographic, Genre, ProposalStatus, SeriesStatus } from '@prisma/client'
import { requiredAccount, requiredMedia } from './demo-seed.helpers'
import { DemoContext, SeriesSeed } from './demo-seed.types'

export const createSeriesWithProposal = async (
  context: DemoContext,
  input: {
    title: string
    mangakaId: string
    editorId?: string
    seriesStatus: SeriesStatus
    proposalStatus: ProposalStatus
    synopsis: string
  }
): Promise<SeriesSeed> => {
  const cover = requiredMedia(context.media, 'manga-page-1').key
  const rough = requiredMedia(context.media, 'rough-drafting').key
  const line = requiredMedia(context.media, 'finished-line-art').key
  const series = await context.prisma.series.create({
    data: {
      mangakaId: input.mangakaId,
      ...(input.editorId ? { editorId: input.editorId, reviewStartedAt: context.now } : {}),
      title: input.title,
      coverImage: cover,
      genres: [Genre.ACTION, Genre.FANTASY, Genre.MYSTERY],
      demographic: Demographic.SHONEN,
      status: input.seriesStatus,
      statusReason: 'Demo seed — dữ liệu có thể reset theo hướng dẫn.',
      statusHistory: [
        {
          fromStatus: 'INITIAL',
          toStatus: input.seriesStatus,
          changedBy: input.mangakaId,
          reason: 'Demo seed',
          at: context.now
        }
      ],
      proposal: {
        synopsis: input.synopsis,
        characterDesigns: [rough, line],
        estimatedLength: 60,
        status: input.proposalStatus,
        storyboardPages: [
          { pageNumber: 1, fileUrl: rough },
          { pageNumber: 2, fileUrl: line },
          { pageNumber: 3, fileUrl: requiredMedia(context.media, 'hokusai-sketchbook').key }
        ],
        createdAt: context.now
      }
    }
  })
  return {
    id: series.id,
    mangakaId: input.mangakaId,
    editorId: input.editorId ?? requiredAccount(context.accounts, 'editor.naomi').id,
    title: input.title
  }
}
