import type { Prisma } from '@prisma/client'

export type CommandClient = {
  $runCommandRaw(command: Prisma.InputJsonObject): Promise<unknown>
}

export type IndexRow = {
  name?: string
  key?: Record<string, number>
  unique?: boolean
  expireAfterSeconds?: number
  partialFilterExpression?: unknown
}

export type IndexInspectionClient = {
  listIndexes(collection: string): Promise<IndexRow[]>
}

export type RolloutRedis = {
  scan(cursor: string, ...args: string[]): Promise<[string, string[]]>
  type(key: string): Promise<string>
  hget(key: string, field: string): Promise<string | null>
  unlink(...keys: string[]): Promise<number>
}

export type TransferRolloutReport = {
  invalidSignatureRoles: number
  transferContractsMissingCoreFields: number
  duplicateTransferRequestContracts: number
  duplicateSourceTransferContracts: number
  invalidBoardDecisionReferences: number
  acceptedRequestsRequiringClassification: number
  partialTransferStatesRequiringClassification: number
  acceptedButOwnerUnchanged: number
  terminatedOriginalWithoutReplacement: number
  executedTransferContractWithoutSettledRequest: number
}

export type GuestVoteRolloutReport = {
  duplicateEffectiveIdentityMethods: number
  missingAuthMethod: number
  missingIpHash: number
  legacyVoteOtpRequests: number
}

export type RolloutIndexVerification = {
  ok: boolean
  transferContractRequestUnique: boolean
  contractSourceTransferPartialUnique: boolean
  voteOtpIdentityMethodUnique: boolean
  voteOtpExpiresTtl: boolean
  conflictingVoteOtpExpiresIndexes: number
}

type CursorResult = { cursor?: { firstBatch?: unknown[] } }

export const batch = (result: unknown): unknown[] => {
  if (typeof result !== 'object' || result === null) return []
  const rows = (result as CursorResult).cursor?.firstBatch
  return Array.isArray(rows) ? rows : []
}

export const countFrom = (result: unknown) => Number((batch(result)[0] as { count?: number } | undefined)?.count ?? 0)

export const sameKey = (actual: Record<string, number> | undefined, expected: Record<string, number>) =>
  actual != null &&
  Object.keys(actual).length === Object.keys(expected).length &&
  Object.entries(expected).every(([key, direction]) => actual[key] === direction)

export const objectIdString = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (typeof value !== 'object' || value === null) return ''
  const oid = (value as { $oid?: unknown }).$oid
  return typeof oid === 'string' ? oid : ''
}

export const ROLLOUT_APPROVAL = 'AUDIT_REMEDIATION_2026_07_25'
export const LEGACY_VOTE_REDIS_PATTERNS = [
  'survey:otp:identity:v1:*',
  'survey:otp:ip:v1:*',
  'vote:otp:*',
  'otp:vote:*'
] as const

export const assertRolloutApproval = (options: { apply: boolean; approval?: string }) => {
  if (options.apply && options.approval !== ROLLOUT_APPROVAL) {
    throw new Error(`Apply refused: pass the explicit approval token ${ROLLOUT_APPROVAL}`)
  }
}
