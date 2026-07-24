import { RoleName } from 'src/core/security/constants/role.constant'

export const ADMIN_CREATABLE_ROLES = [RoleName.EDITOR, RoleName.BOARD_MEMBER] as const
export type AdminCreatableRole = (typeof ADMIN_CREATABLE_ROLES)[number]

export type CommitmentSummary = {
  total: number
  activeSeries: number
  executedContracts: number
  openTasks: number
  activeAssignments: number
  pendingBoardDecisions: number
}
