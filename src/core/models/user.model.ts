import { $Enums } from '@prisma/client'
import z from 'zod'

// UserStatus comes from Prisma as the single source of truth.
export const UserStatus = $Enums.UserStatus
export type UserStatusType = $Enums.UserStatus

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(6).max(100),
  phoneNumber: z.string().min(9).max(15),
  avatar: z.string().nullable(),
  displayName: z.string().min(2).max(100).nullable(),
  status: z.nativeEnum($Enums.UserStatus),
  roleId: z.string(),
  deletedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
})
export type UserType = z.infer<typeof UserSchema>
