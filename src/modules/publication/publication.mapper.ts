import { PublicationVersion } from '@prisma/client'
import { PublicationVersionResType } from './schemas/publication-schemas'

export function toPublicationVersionRes(v: PublicationVersion): PublicationVersionResType {
  return {
    id: v.id,
    seriesId: v.seriesId,
    language: v.language,
    readingDirection: v.readingDirection,
    versionType: v.versionType ?? null,
    notes: v.notes ?? null,
    createdAt: v.createdAt.toISOString()
  }
}
