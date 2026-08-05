import { Prisma, PublicationType, Series, SeriesStatus } from '@prisma/client'

export type SeriesListScope = { kind: 'mangaka'; userId: string } | { kind: 'editor'; userId: string } | { kind: 'all' }

export type SeriesListFilter = {
  scope: SeriesListScope
  status?: SeriesStatus
  magazine?: string
  publicationType?: PublicationType
}

export type SeriesMetadataField = 'title' | 'coverImage' | 'synopsis' | 'characterDesigns'

export type SeriesMetadataUpdateResult =
  | { outcome: 'UPDATED'; series: Series; changedFields: SeriesMetadataField[] }
  | { outcome: 'UNCHANGED'; series: Series }
  | { outcome: 'GUARD_MISMATCH'; series: Series }
  | { outcome: 'RETRY_EXHAUSTED'; series: Series }

export type SeriesMetadataUpdateGuard = {
  authorization: { kind: 'OWNER' | 'EDITOR'; userId: string }
  blockedStatuses: SeriesStatus[]
}

export type SeriesProposalCasMutation =
  | { outcome: 'UNCHANGED' }
  | { outcome: 'GUARD_MISMATCH' }
  | { outcome: 'PROPOSAL_MISSING' }
  | {
      outcome: 'WRITE'
      data: Prisma.SeriesUpdateManyMutationInput
      where?: Prisma.SeriesWhereInput
      guardProposal: boolean
      changedFields?: SeriesMetadataField[]
    }

export type SeriesProposalCasResult =
  | { outcome: 'UPDATED'; series: Series; changedFields: SeriesMetadataField[] }
  | { outcome: 'UNCHANGED'; series: Series }
  | { outcome: 'GUARD_MISMATCH'; series: Series }
  | { outcome: 'PROPOSAL_MISSING'; series: Series }
  | { outcome: 'NOT_FOUND' }
  | { outcome: 'RETRY_EXHAUSTED'; series: Series }
