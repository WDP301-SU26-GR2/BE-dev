import { Series } from '@prisma/client'

export function toSeriesRes(series: Series) {
  return {
    id: series.id,
    mangakaId: series.mangakaId,
    editorId: series.editorId,
    coOwnerId: series.coOwnerId,
    parentSeriesId: series.parentSeriesId,
    title: series.title,
    coverImage: series.coverImage,
    genres: series.genres,
    demographic: series.demographic,
    publicationType: series.publicationType,
    magazine: series.magazine,
    startIssueNumber: series.startIssueNumber,
    status: series.status,
    statusReason: series.statusReason,
    relationshipType: series.relationshipType,
    franchiseConsentStatus: series.franchiseConsentStatus,
    createdAt: series.createdAt.toISOString(),
    reviewStartedAt: series.reviewStartedAt ? series.reviewStartedAt.toISOString() : null,
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
