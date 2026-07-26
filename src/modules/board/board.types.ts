import type { $Enums } from '@prisma/client'

export type TransferDecisionContext = {
  id: string
  boardSessionId: string
  targetSeriesId: string | null
  decisionType: $Enums.DecisionType | null
  result: $Enums.BoardDecisionResult | null
  allowedEditorIds: string[]
}
