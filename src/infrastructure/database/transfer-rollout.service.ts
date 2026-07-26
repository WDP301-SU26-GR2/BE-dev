import type { Prisma } from '@prisma/client'
import {
  assertRolloutApproval,
  batch,
  type CommandClient,
  countFrom,
  objectIdString,
  type TransferRolloutReport
} from './audit-rollout.types'
import { TRANSFER_PREFLIGHT_QUERIES } from './transfer-rollout.queries'

export class TransferRolloutService {
  constructor(private readonly mongo: CommandClient) {}

  async preflight(): Promise<TransferRolloutReport> {
    const report = Object.fromEntries(
      await Promise.all(
        TRANSFER_PREFLIGHT_QUERIES.map(async ([name, pipeline]) => [
          name,
          await this.count(this.collectionFor(name), pipeline)
        ])
      )
    ) as Partial<TransferRolloutReport>
    report.duplicateTransferRequestContracts = await this.duplicateCount('TransferContract', 'transferRequestId')
    report.duplicateSourceTransferContracts = await this.duplicateCount('Contract', 'sourceTransferRequestId')
    return report as TransferRolloutReport
  }

  async remediateAccepted(options: {
    ids: string[]
    apply: boolean
    approval?: string
  }): Promise<{ requested: number; eligible: number; updated: number; rejectedIds: string[] }> {
    assertRolloutApproval(options)
    const uniqueIds = [
      ...new Set(options.ids.map((id) => id.trim().toLowerCase()).filter((id) => /^[a-f0-9]{24}$/.test(id)))
    ]
    if (uniqueIds.length === 0) return { requested: 0, eligible: 0, updated: 0, rejectedIds: [] }
    const candidates = await this.mongo.$runCommandRaw({
      aggregate: 'TransferRequest',
      pipeline: [
        { $match: { _id: { $in: uniqueIds.map((id) => ({ $oid: id })) }, status: 'ACCEPTED' } },
        {
          $lookup: {
            from: 'TransferContract',
            localField: '_id',
            foreignField: 'transferRequestId',
            as: 'transferContracts'
          }
        },
        { $lookup: { from: 'Series', localField: 'seriesId', foreignField: '_id', as: 'series' } },
        {
          $match: {
            $expr: {
              $and: [
                { $eq: [{ $size: '$transferContracts' }, 1] },
                { $eq: [{ $arrayElemAt: ['$transferContracts.status', 0] }, 'FULLY_EXECUTED'] },
                { $eq: [{ $arrayElemAt: ['$series.mangakaId', 0] }, '$requestingMangakaId'] }
              ]
            }
          }
        },
        { $project: { _id: 1 } }
      ],
      cursor: {}
    })
    const eligibleIds = batch(candidates)
      .map((row) => objectIdString((row as { _id?: unknown })._id))
      .filter(Boolean)
    const rejectedIds = uniqueIds.filter((id) => !eligibleIds.includes(id))
    if (options.apply && eligibleIds.length > 0) {
      await this.mongo.$runCommandRaw({
        update: 'TransferRequest',
        updates: [
          {
            q: { _id: { $in: eligibleIds.map((id) => ({ $oid: id })) }, status: 'ACCEPTED' },
            u: { $set: { status: 'COMPLETED' } },
            multi: true
          }
        ]
      })
    }
    return {
      requested: uniqueIds.length,
      eligible: eligibleIds.length,
      updated: options.apply ? eligibleIds.length : 0,
      rejectedIds
    }
  }

  private collectionFor(name: string) {
    if (name === 'invalidSignatureRoles') return 'TransferContractSignature'
    if (name === 'transferContractsMissingCoreFields' || name === 'executedTransferContractWithoutSettledRequest') {
      return 'TransferContract'
    }
    return 'TransferRequest'
  }

  private async count(collection: string, pipeline: Prisma.InputJsonValue[]) {
    return countFrom(
      await this.mongo.$runCommandRaw({
        aggregate: collection,
        pipeline: [...pipeline, { $count: 'count' }],
        cursor: {}
      })
    )
  }

  private duplicateCount(collection: string, field: string) {
    return this.count(collection, [
      { $match: { [field]: { $type: 'objectId' } } },
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ])
  }
}
