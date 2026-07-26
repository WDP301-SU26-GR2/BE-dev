import { Series } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { SeriesNotFoundException } from '../errors/series.errors'
import { SERIES_PROPOSAL_CAS_MAX_ATTEMPTS } from '../series.constant'
import { SeriesProposalCasMutation, SeriesProposalCasResult } from './series-repository.types'

export class SeriesProposalCasExhaustedError extends Error {
  constructor(seriesId: string) {
    super(`Series proposal write conflict after ${SERIES_PROPOSAL_CAS_MAX_ATTEMPTS} attempts: ${seriesId}`)
    this.name = 'SeriesProposalCasExhaustedError'
  }
}

export class SeriesProposalCasRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async update(
    seriesId: string,
    buildMutation: (series: Series) => SeriesProposalCasMutation
  ): Promise<SeriesProposalCasResult> {
    let series = await this.prismaService.series.findUnique({ where: { id: seriesId } })
    if (!series) return { outcome: 'NOT_FOUND' }
    for (let attempt = 0; attempt < SERIES_PROPOSAL_CAS_MAX_ATTEMPTS; attempt += 1) {
      const mutation = buildMutation(series)
      if (mutation.outcome !== 'WRITE') return { outcome: mutation.outcome, series }
      const guarded = await this.prismaService.series.updateMany({
        where: {
          id: seriesId,
          ...(mutation.where ?? {}),
          ...(mutation.guardProposal
            ? { proposal: series.proposal ? { equals: series.proposal } : { isSet: false } }
            : {})
        },
        data: mutation.data
      })
      if (guarded.count === 1) {
        const updated = await this.prismaService.series.findUnique({ where: { id: seriesId } })
        if (!updated) return { outcome: 'NOT_FOUND' }
        return { outcome: 'UPDATED', series: updated, changedFields: mutation.changedFields ?? [] }
      }
      const latest = await this.prismaService.series.findUnique({ where: { id: seriesId } })
      if (!latest) return { outcome: 'NOT_FOUND' }
      series = latest
      if (attempt === SERIES_PROPOSAL_CAS_MAX_ATTEMPTS - 1) return { outcome: 'RETRY_EXHAUSTED', series }
    }
    return { outcome: 'RETRY_EXHAUSTED', series }
  }

  requireWrite(result: SeriesProposalCasResult, seriesId: string): Series {
    if (result.outcome === 'UPDATED' || result.outcome === 'UNCHANGED') return result.series
    if (result.outcome === 'NOT_FOUND' || result.outcome === 'PROPOSAL_MISSING') throw SeriesNotFoundException
    throw new SeriesProposalCasExhaustedError(seriesId)
  }
}
