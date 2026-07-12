import { Name } from '@prisma/client'

export function toNameRes(name: Name & { pages?: { pageNumber: number; fileUrl: string }[] }) {
  return {
    id: name.id,
    seriesId: name.seriesId,
    chapterId: name.chapterId ?? null,
    chapterNumber: name.chapterNumber,
    kind: name.kind,
    status: name.status,
    version: name.version,
    pages: name.pages ?? [],
    submittedAt: name.submittedAt ? name.submittedAt.toISOString() : null
  }
}
