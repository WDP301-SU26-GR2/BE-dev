import { ManuscriptStatus, NameKind, NameStatus, PageStatus } from '@prisma/client'
import { DAY, requiredMedia } from './demo-seed.helpers'
import { DemoContext, SeriesSeed } from './demo-seed.types'

export const createChapterBundle = async (
  context: DemoContext,
  series: SeriesSeed,
  input: {
    chapterNumber: number
    title: string
    nameStatus: NameStatus
    manuscriptStatus: ManuscriptStatus
    pageStatus?: PageStatus
    pageCount: number
    publishedAt?: Date
    pageMediaSlugs?: readonly string[]
  }
) => {
  const chapter = await context.prisma.chapter.create({
    data: {
      seriesId: series.id,
      chapterNumber: input.chapterNumber,
      title: input.title,
      totalPages: input.pageCount,
      status:
        input.manuscriptStatus === ManuscriptStatus.PUBLISHED
          ? 'PUBLISHED'
          : input.manuscriptStatus === ManuscriptStatus.DRAFT
            ? 'DRAFT'
            : 'IN_PRODUCTION',
      publishedAt: input.publishedAt ?? null
    }
  })
  const name = await context.prisma.name.create({
    data: {
      seriesId: series.id,
      chapterId: chapter.id,
      chapterNumber: input.chapterNumber,
      status: input.nameStatus,
      kind: NameKind.CHAPTER,
      version: input.nameStatus === NameStatus.APPROVED ? 3 : 1,
      submittedAt: context.now,
      pages: [
        { pageNumber: 1, fileUrl: requiredMedia(context.media, 'rough-drafting').key },
        { pageNumber: 2, fileUrl: requiredMedia(context.media, 'finished-line-art').key }
      ]
    }
  })
  await context.prisma.chapter.update({ where: { id: chapter.id }, data: { nameId: name.id } })
  await context.prisma.manuscript.create({
    data: {
      chapterId: chapter.id,
      status: input.manuscriptStatus,
      finalFile:
        input.manuscriptStatus === ManuscriptStatus.PUBLISHED
          ? requiredMedia(context.media, 'scanlated-page').key
          : null,
      submittedToEditorAt:
        input.manuscriptStatus === ManuscriptStatus.EDITOR_REVIEW ||
        input.manuscriptStatus === ManuscriptStatus.EDITOR_REVISION ||
        input.manuscriptStatus === ManuscriptStatus.READY_FOR_PRINT ||
        input.manuscriptStatus === ManuscriptStatus.PUBLISHED
          ? new Date(context.now.getTime() - DAY)
          : null,
      approvedAt:
        input.manuscriptStatus === ManuscriptStatus.READY_FOR_PRINT ||
        input.manuscriptStatus === ManuscriptStatus.PUBLISHED
          ? context.now
          : null,
      statusHistory: [
        {
          from: null,
          to: input.manuscriptStatus,
          changedBy: series.mangakaId,
          reason: 'Demo seed',
          changedAt: context.now
        }
      ]
    }
  })
  const deadline = input.publishedAt
    ? new Date(input.publishedAt.getTime() - DAY)
    : new Date(context.now.getTime() + 7 * DAY)
  await context.prisma.schedule.create({
    data: {
      chapterId: chapter.id,
      originalDeadline: deadline,
      currentDeadline: deadline,
      extended: false,
      extensions: []
    }
  })
  const pages = await Promise.all(
    Array.from({ length: input.pageCount }, async (_, index) => {
      const pageNumber = index + 1
      const source = requiredMedia(
        context.media,
        input.pageMediaSlugs?.[index % input.pageMediaSlugs.length] ?? `manga-page-${(index % 4) + 1}`
      )
      return context.prisma.page.create({
        data: {
          chapterId: chapter.id,
          pageNumber,
          originalFile: source.key,
          compositeFile:
            input.pageStatus === PageStatus.COMPLETED || input.pageStatus === PageStatus.REVISING
              ? requiredMedia(context.media, 'scanlated-page').key
              : null,
          compositeRevision:
            input.pageStatus === PageStatus.COMPLETED || input.pageStatus === PageStatus.REVISING ? 3 : 0,
          canvasWidth: 1080,
          canvasHeight: 1440,
          status: input.pageStatus ?? PageStatus.DRAFT
        }
      })
    })
  )
  return { chapter, name, pages, pageIds: pages.map((page) => page.id) }
}
