import { Name, Series } from '@prisma/client'

export function toSeriesRes(series: Series) {
  return {
    id: series.id,
    mangakaId: series.mangakaId,
    editorId: series.editorId,
    coOwnerId: series.coOwnerId,
    parentSeriesId: series.parentSeriesId,
    title: series.title,
    coverImage: series.coverImage,
    genre: series.genre,
    demographic: series.demographic,
    publicationType: series.publicationType,
    status: series.status,
    statusReason: series.statusReason,
    relationshipType: series.relationshipType,
    createdAt: series.createdAt.toISOString(),
    proposal: series.proposal
      ? {
          nameId: series.proposal.nameId,
          synopsis: series.proposal.synopsis,
          characterDesigns: series.proposal.characterDesigns,
          estimatedLength: series.proposal.estimatedLength,
          status: series.proposal.status,
          createdAt: series.proposal.createdAt.toISOString()
        }
      : null
  }
}

export function toNameRes(name: Name) {
  return {
    id: name.id,
    seriesId: name.seriesId,
    chapterNumber: name.chapterNumber,
    status: name.status,
    version: name.version,
    submittedAt: name.submittedAt ? name.submittedAt.toISOString() : null,
    pages: name.pages.map((p) => ({ pageNumber: p.pageNumber, fileUrl: p.fileUrl }))
  }
}
