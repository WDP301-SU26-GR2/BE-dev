import { Series } from '@prisma/client'
import { toUserMini, type UserMiniRow } from 'src/core/models/user-mini.model'

// Spec 16: mini object hiển thị người dùng — CHỈ có khi repository đính kèm rows người dùng.
type SeriesWithPeople = Series & { mangaka?: UserMiniRow; editor?: UserMiniRow | null }

export function toSeriesRes(series: SeriesWithPeople) {
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
    // PB-06: surface the completion proposal so the caller can read back what they just set.
    completionProposal: series.completionProposal
      ? {
          proposedByRole: series.completionProposal.proposedByRole,
          proposedById: series.completionProposal.proposedById,
          reason: series.completionProposal.reason,
          proposedEndingChapters: series.completionProposal.proposedEndingChapters ?? null,
          proposedAt: series.completionProposal.proposedAt.toISOString()
        }
      : null,
    proposal: series.proposal
      ? {
          synopsis: series.proposal.synopsis,
          characterDesigns: series.proposal.characterDesigns,
          storyboardPages: (series.proposal.storyboardPages ?? []).map((p) => ({
            pageNumber: p.pageNumber,
            fileUrl: p.fileUrl
          })),
          estimatedLength: series.proposal.estimatedLength,
          status: series.proposal.status,
          createdAt: series.proposal.createdAt.toISOString()
        }
      : null,
    // Spec 16 — absent khi caller không include relation (mutation path) → serializer bỏ qua (schema .optional()).
    ...(series.mangaka !== undefined ? { mangaka: toUserMini(series.mangaka) } : {}),
    ...(series.editor !== undefined ? { editor: series.editor ? toUserMini(series.editor) : null } : {})
  }
}

export function toSeriesListItem(series: SeriesWithPeople) {
  return {
    id: series.id,
    mangakaId: series.mangakaId,
    editorId: series.editorId,
    title: series.title,
    coverImage: series.coverImage,
    genres: series.genres,
    demographic: series.demographic,
    publicationType: series.publicationType,
    magazine: series.magazine,
    status: series.status,
    createdAt: series.createdAt.toISOString(),
    ...(series.mangaka !== undefined ? { mangaka: toUserMini(series.mangaka) } : {}),
    ...(series.editor !== undefined ? { editor: series.editor ? toUserMini(series.editor) : null } : {})
  }
}
