import { extendApi } from '@anatine/zod-openapi'
import { Demographic, Genre, PublicationType, SeriesStatus } from '@prisma/client'
import z from 'zod'
import { zEnum } from 'src/core/http/docs/enum-docs'

export const PublicSeriesListQuerySchema = extendApi(
  z
    .object({
      q: z.string().min(1).max(100).optional().describe('Search by title (case-insensitive contains match)'),
      genre: zEnum(Genre, 'Genre').optional(),
      demographic: zEnum(Demographic, 'Demographic').optional(),
      publicationType: zEnum(PublicationType, 'PublicationType')
        .optional()
        .describe('Lọc theo nhịp xuất bản: WEEKLY / MONTHLY / IRREGULAR'),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      offset: z.coerce.number().int().min(0).default(0)
    })
    .strict(),
  { title: 'PublicSeriesListQuery', description: 'Public catalog filters — Spec 15' }
)

const PublicSeriesItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    synopsis: z.string().nullable().describe('Series.proposal.synopsis; null when unavailable'),
    coverImageUrl: z.string().nullable().describe('Short-lived signed URL; null when the series has no cover image'),
    genres: z.array(zEnum(Genre, 'Genre')),
    demographic: zEnum(Demographic, 'Demographic').nullable(),
    status: zEnum(SeriesStatus, 'SeriesStatus'),
    publicationType: zEnum(PublicationType, 'PublicationType').nullable(),
    magazine: z.string().nullable(),
    publishedChapterCount: z.number().int().describe('Number of PUBLISHED chapters; 0 means coming soon')
  })
  .strict()

export const PublicSeriesListResSchema = extendApi(
  z
    .object({
      items: z.array(PublicSeriesItemSchema),
      total: z.number().int(),
      limit: z.number().int(),
      offset: z.number().int()
    })
    .strict(),
  { title: 'PublicSeriesListRes', description: 'Public series catalog — Spec 15 §2.1' }
)

const PublicChapterSchema = z
  .object({
    id: z.string(),
    chapterNumber: z.number().int(),
    title: z.string().nullable(),
    publishedAt: z.string().describe('ISO 8601 UTC')
  })
  .strict()

export const PublicSeriesDetailResSchema = extendApi(
  PublicSeriesItemSchema.extend({
    chapters: z.array(PublicChapterSchema)
  }).strict(),
  { title: 'PublicSeriesDetailRes', description: 'Public series detail and PUBLISHED chapters — Spec 15 §2.2' }
)

export const PublicChapterPagesResSchema = extendApi(
  z
    .object({
      series: z.object({ id: z.string(), title: z.string() }).strict(),
      chapter: PublicChapterSchema,
      pages: z.array(
        z
          .object({
            pageNumber: z.number().int(),
            imageUrl: z.string().describe('Short-lived signed URL; request this endpoint again after expiry')
          })
          .strict()
      ),
      prevChapterId: z.string().nullable().describe('Previous PUBLISHED chapter by chapterNumber'),
      nextChapterId: z.string().nullable().describe('Next PUBLISHED chapter by chapterNumber')
    })
    .strict(),
  { title: 'PublicChapterPagesRes', description: 'Public chapter reader — Spec 15 §2.3' }
)

export type PublicSeriesListQueryType = z.infer<typeof PublicSeriesListQuerySchema>
