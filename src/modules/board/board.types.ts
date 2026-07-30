import type { $Enums } from '@prisma/client'

export type TransferDecisionContext = {
  id: string
  boardSessionId: string
  targetSeriesId: string | null
  // §v2 point 5: request mà quyết định TRANSFER này được tạo cho (null cho quyết định cũ / không phải TRANSFER).
  transferRequestId: string | null
  decisionType: $Enums.DecisionType | null
  result: $Enums.BoardDecisionResult | null
  allowedEditorIds: string[]
}

export const CONTRACT_DECISION_RESOURCE_TYPES = [
  'PUBLICATION_CONTRACT',
  'CONTRACT_AMENDMENT',
  'TRANSFER_CONTRACT',
  'REPLACEMENT_CONTRACT'
] as const

export type ContractDecisionResourceType = (typeof CONTRACT_DECISION_RESOURCE_TYPES)[number]

export type ContractDecisionContext = {
  id: string
  boardSessionId: string
  targetSeriesId: string | null
  decisionType: $Enums.DecisionType | null
  result: $Enums.BoardDecisionResult | null
  details: Record<string, unknown> | null
  decidedAt: Date | null
  allowedEditorIds: string[]
}
