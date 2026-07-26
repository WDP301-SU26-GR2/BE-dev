import type { RoleNameType } from 'src/core/security/constants/role.constant'

export type ActorContext = {
  userId: string
  roleName: RoleNameType
}

export type TransferSignerRole = 'MANGAKA_A' | 'MANGAKA_B' | 'BOARD'
