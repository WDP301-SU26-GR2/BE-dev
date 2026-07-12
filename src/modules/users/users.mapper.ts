import { $Enums, UserStatus } from '@prisma/client'

export type MeRow = {
  id: string
  email: string
  name: string
  displayName: string | null
  avatar: string | null
  phoneNumber: string
  status: UserStatus
  emailVerified: boolean
  mustChangePassword: boolean
  createdAt: Date
  role: { code: string }
}

export function toMeRes(u: MeRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    displayName: u.displayName ?? null,
    avatar: u.avatar ?? null,
    phoneNumber: u.phoneNumber,
    role: u.role.code as $Enums.RoleCode,
    status: u.status,
    emailVerified: u.emailVerified,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt.toISOString()
  }
}
