import type { Prisma } from '@prisma/client'

export const TRANSFER_PREFLIGHT_QUERIES: Array<[string, Prisma.InputJsonValue[]]> = [
  ['invalidSignatureRoles', [{ $match: { role: { $nin: ['MANGAKA_A', 'MANGAKA_B', 'BOARD'] } } }]],
  [
    'transferContractsMissingCoreFields',
    [
      {
        $match: {
          $expr: {
            $or: [
              { $ne: [{ $type: '$transferRequestId' }, 'objectId'] },
              { $ne: [{ $type: '$seriesId' }, 'objectId'] },
              { $ne: [{ $type: '$fromMangakaId' }, 'objectId'] },
              { $ne: [{ $type: '$toMangakaId' }, 'objectId'] },
              { $eq: [{ $type: '$transferType' }, 'missing'] }
            ]
          }
        }
      }
    ]
  ],
  [
    'invalidBoardDecisionReferences',
    [
      { $match: { boardDecisionId: { $exists: true } } },
      { $lookup: { from: 'BoardDecision', localField: 'boardDecisionId', foreignField: '_id', as: 'decision' } },
      { $unwind: { path: '$decision', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          $expr: {
            $or: [
              { $eq: [{ $type: '$decision._id' }, 'missing'] },
              { $ne: ['$decision.decisionType', 'TRANSFER'] },
              { $ne: ['$decision.targetSeriesId', '$seriesId'] },
              {
                $ne: [
                  '$decision.result',
                  { $cond: [{ $eq: ['$status', 'REJECTED_BY_BOARD'] }, 'REJECTED', 'APPROVED'] }
                ]
              }
            ]
          }
        }
      }
    ]
  ],
  ['acceptedRequestsRequiringClassification', [{ $match: { status: 'ACCEPTED' } }]],
  [
    'partialTransferStatesRequiringClassification',
    [
      {
        $match: {
          status: { $in: ['ACCEPTED', 'AWAITING_REPLACEMENT_SIGNATURES', 'AWAITING_TRANSFER_SIGNATURES'] }
        }
      }
    ]
  ],
  [
    'acceptedButOwnerUnchanged',
    [
      { $match: { status: 'ACCEPTED' } },
      { $lookup: { from: 'Series', localField: 'seriesId', foreignField: '_id', as: 'series' } },
      { $unwind: { path: '$series', preserveNullAndEmptyArrays: true } },
      { $match: { $expr: { $ne: ['$series.mangakaId', '$requestingMangakaId'] } } }
    ]
  ],
  [
    'terminatedOriginalWithoutReplacement',
    [
      { $lookup: { from: 'Contract', localField: 'originalContractId', foreignField: '_id', as: 'original' } },
      { $unwind: '$original' },
      { $match: { 'original.status': 'TERMINATED' } },
      {
        $lookup: {
          from: 'Contract',
          localField: '_id',
          foreignField: 'sourceTransferRequestId',
          as: 'replacement'
        }
      },
      { $match: { replacement: { $size: 0 } } }
    ]
  ],
  [
    'executedTransferContractWithoutSettledRequest',
    [
      { $match: { status: 'FULLY_EXECUTED' } },
      {
        $lookup: {
          from: 'TransferRequest',
          localField: 'transferRequestId',
          foreignField: '_id',
          as: 'request'
        }
      },
      { $unwind: { path: '$request', preserveNullAndEmptyArrays: true } },
      { $match: { 'request.status': { $nin: ['ACCEPTED', 'COMPLETED'] } } }
    ]
  ]
]
