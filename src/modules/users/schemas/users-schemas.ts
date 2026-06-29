import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { $Enums, Genre, RoleCode } from '@prisma/client'
import { zEnum, zRole, zRoleSubset } from 'src/core/http/docs/enum-docs'

export const AdminCreateUserBodySchema = extendApi(
  z
    .object({
      email: z.string().email(),
      name: z.string().min(2).max(100),
      phoneNumber: z.string().min(9).max(15),
      roleCode: zRoleSubset([RoleCode.EDITOR, RoleCode.BOARD_MEMBER])
    })
    .strict(),
  { title: 'AdminCreateUserBody', description: 'Super Admin creates an Editor/Board user' }
)

export const AdminCreateUserResSchema = extendApi(
  z.object({
    id: z.string(),
    email: z.string(),
    roleCode: zRole(),
    temporaryPassword: z.string()
  }),
  { title: 'AdminCreateUserRes', description: 'Created user + one-time temporary password' }
)

export const MangakaProfileBodySchema = extendApi(
  z
    .object({
      penName: z.string().min(1).max(100),
      genres: z.array(zEnum(Genre, 'Genre')).default([]),
      experienceLevel: z.string().optional(),
      bio: z.string().optional(),
      portfolioFiles: z.array(z.string()).default([])
    })
    .strict(),
  { title: 'MangakaProfileBody', description: 'Upsert mangaka profile' }
)

export const MangakaProfileResSchema = extendApi(
  z.object({
    userId: z.string(),
    penName: z.string().nullable(),
    genres: z.array(zEnum(Genre, 'Genre')),
    experienceLevel: z.string().nullable(),
    bio: z.string().nullable(),
    portfolioFiles: z.array(z.string()),
    reputationScore: z.number(),
    ratingAvg: z.number(),
    ratingCount: z.number(),
    isRecommended: z.boolean(),
    displayName: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    hasProfile: z.boolean().describe('false = user chưa build hồ sơ; field profile = default rỗng')
  }),
  { title: 'MangakaProfileRes', description: 'Mangaka profile view (public). hasProfile=false khi chưa cập nhật.' }
)

export const AssistantProfileBodySchema = extendApi(
  z
    .object({
      specializations: z.array(zEnum($Enums.Specialization, 'Specialization')).default([]),
      experienceLevel: z.string().optional(),
      portfolioFiles: z.array(z.string()).default([]),
      availabilityStatus: zEnum($Enums.AvailabilityStatus, 'AvailabilityStatus').optional(),
      // ISO 8601 date-time strings (z.date() can't be represented in JSON Schema / Swagger)
      availabilityFrom: z.string().datetime({ offset: true }).optional(),
      availabilityTo: z.string().datetime({ offset: true }).optional()
    })
    .strict(),
  { title: 'AssistantProfileBody', description: 'Upsert assistant profile' }
)

export const AssistantProfileResSchema = extendApi(
  z.object({
    userId: z.string(),
    specializations: z.array(zEnum($Enums.Specialization, 'Specialization')),
    experienceLevel: z.string().nullable(),
    portfolioFiles: z.array(z.string()),
    availabilityStatus: zEnum($Enums.AvailabilityStatus, 'AvailabilityStatus').nullable(),
    availabilityFrom: z.string().nullable(),
    availabilityTo: z.string().nullable(),
    reputationScore: z.number(),
    ratingAvg: z.number(),
    ratingCount: z.number(),
    isRecommended: z.boolean(),
    displayName: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    hasProfile: z.boolean().describe('false = user chưa build hồ sơ; field profile = default rỗng')
  }),
  { title: 'AssistantProfileRes', description: 'Assistant profile view (public). hasProfile=false khi chưa cập nhật.' }
)

export type AdminCreateUserBodyType = z.infer<typeof AdminCreateUserBodySchema>
export type MangakaProfileBodyType = z.infer<typeof MangakaProfileBodySchema>
export type AssistantProfileBodyType = z.infer<typeof AssistantProfileBodySchema>

// ---- Admin: list/detail users ----
export const ListUsersQuerySchema = extendApi(
  z
    .object({
      roleCode: zRole().optional(),
      status: zEnum($Enums.UserStatus, 'UserStatus').optional(),
      search: z.string().min(1).max(200).optional(),
      limit: z.coerce.number().int().positive().max(100).default(20),
      offset: z.coerce.number().int().nonnegative().default(0),
      // Boolean từ query string: 'true' → true, còn lại (kể cả thiếu) → false.
      // KHÔNG dùng z.coerce.boolean() vì 'false' (chuỗi non-empty) sẽ ra true.
      includeDeleted: z
        .enum(['true', 'false'])
        .optional()
        .transform((v) => v === 'true')
    })
    .strict(),
  { title: 'ListUsersQuery', description: 'Admin filter danh sách user' }
)

export const AdminUserResSchema = extendApi(
  z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    displayName: z.string().nullable(),
    phoneNumber: z.string(),
    avatar: z.string().nullable(),
    role: zRole(),
    status: zEnum($Enums.UserStatus, 'UserStatus'),
    emailVerified: z.boolean(),
    registrationType: zEnum($Enums.RegistrationType, 'RegistrationType'),
    mustChangePassword: z.boolean(),
    createdAt: z.string()
  }),
  { title: 'AdminUserRes', description: 'Admin view của 1 user (KHÔNG có password)' }
)

export const AdminUserListResSchema = extendApi(
  z.object({
    items: z.array(AdminUserResSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number()
  }),
  { title: 'AdminUserListRes', description: 'Danh sách user phân trang' }
)

export type ListUsersQueryType = z.infer<typeof ListUsersQuerySchema>
