import { Chapter, Manuscript, Page, Schedule } from '@prisma/client'

type ChapterWithRels = Chapter & { manuscript?: Manuscript | null; schedule?: Schedule | null }

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export function toScheduleRes(schedule: Schedule | null | undefined) {
  if (!schedule) return null
  return {
    id: schedule.id,
    chapterId: schedule.chapterId,
    originalDeadline: iso(schedule.originalDeadline),
    currentDeadline: iso(schedule.currentDeadline),
    extended: schedule.extended,
    extensions: schedule.extensions.map((e) => ({
      extendedBy: e.extendedBy ?? null,
      previousDeadline: iso(e.previousDeadline),
      newDeadline: iso(e.newDeadline),
      reason: e.reason ?? null,
      extendedAt: e.extendedAt.toISOString()
    }))
  }
}

export function toChapterRes(chapter: ChapterWithRels) {
  return {
    id: chapter.id,
    seriesId: chapter.seriesId,
    nameId: chapter.nameId,
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    totalPages: chapter.totalPages,
    status: chapter.status,
    publishedAt: iso(chapter.publishedAt),
    hold: chapter.hold
      ? {
          reason: chapter.hold.reason,
          expectedReturnDate: iso(chapter.hold.expectedReturnDate),
          heldBy: chapter.hold.heldBy,
          heldAt: chapter.hold.heldAt.toISOString()
        }
      : null,
    manuscriptStatus: chapter.manuscript?.status ?? null,
    schedule: toScheduleRes(chapter.schedule)
  }
}

export function toPageRes(page: Page) {
  return {
    id: page.id,
    chapterId: page.chapterId,
    pageNumber: page.pageNumber,
    originalFile: page.originalFile,
    compositeFile: page.compositeFile,
    status: page.status,
    createdAt: page.createdAt.toISOString()
  }
}
