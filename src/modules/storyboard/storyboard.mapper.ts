import { Storyboard } from '@prisma/client'

// Spec 28: Storyboard luôn thuộc chương — bỏ `kind` & `chapterNumber` khỏi response.
export function toStoryboardRes(storyboard: Storyboard & { pages?: { pageNumber: number; fileUrl: string }[] }) {
  return {
    id: storyboard.id,
    seriesId: storyboard.seriesId,
    chapterId: storyboard.chapterId,
    status: storyboard.status,
    version: storyboard.version,
    pages: storyboard.pages ?? [],
    submittedAt: storyboard.submittedAt ? storyboard.submittedAt.toISOString() : null
  }
}
