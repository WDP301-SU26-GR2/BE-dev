import { z } from 'zod'
import { extendApi } from '@anatine/zod-openapi'
import { $Enums, Demographic, Genre, RoleCode } from '@prisma/client'
import { zEnum, zRole, zRoleSubset } from 'src/core/http/docs/enum-docs'
import { PhoneNumberE164Schema } from 'src/core/models/user.model'

export const AdminCreateUserBodySchema = extendApi(
  z
    .object({
      email: z.string().email(),
      name: z.string().min(2).max(100),
      phoneNumber: PhoneNumberE164Schema,
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

export const AdminUpdateUserStatusBodySchema = extendApi(
  z
    .object({
      status: z
        .enum([$Enums.UserStatus.ACTIVE, $Enums.UserStatus.BANNED, $Enums.UserStatus.BLOCKED])
        .describe('Allowed status changes: ACTIVE, BANNED, BLOCKED. INACTIVE is not allowed (pre-verify state).'),
      reason: z.string().min(1).optional().describe('Ban/block reason — included in the notification sent to the user')
    })
    .strict(),
  { title: 'AdminUpdateUserStatusBody', description: 'Super Admin updates a non-admin user status' }
)

export const AdminResetPasswordResSchema = extendApi(
  z.object({
    temporaryPassword: z.string().describe('Returned once only — user is forced to change it on next login')
  }),
  { title: 'AdminResetPasswordRes', description: 'One-time temporary password returned only in this response' }
)

export const AdminStatsResSchema = extendApi(
  z.object({
    users: z.object({
      total: z.number().describe('Users not soft-deleted'),
      deleted: z.number().describe('Soft-deleted users'),
      byStatus: z.record(zEnum($Enums.UserStatus, 'UserStatus'), z.number()),
      byRole: z.record(zRole(), z.number())
    }),
    series: z.object({
      total: z.number(),
      byStatus: z.record(zEnum($Enums.SeriesStatus, 'SeriesStatus'), z.number())
    }),
    chapters: z.object({ total: z.number(), published: z.number() }),
    tasks: z.object({
      total: z.number(),
      byStatus: z.record(zEnum($Enums.TaskStatus, 'TaskStatus'), z.number())
    })
  }),
  { title: 'AdminStatsRes', description: 'System snapshot (groupBy counts, zero-filled enum maps)' }
)

// ---- Part A (Spec 12): tài khoản tự phục vụ ----
export const MeResSchema = extendApi(
  z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    displayName: z.string().nullable(),
    avatar: z.string().nullable().describe('Object key trên R2 (A7) — FE đổi sang signed GET để hiển thị'),
    phoneNumber: z.string(),
    role: zRole(),
    status: zEnum($Enums.UserStatus, 'UserStatus'),
    emailVerified: z.boolean(),
    mustChangePassword: z.boolean(),
    createdAt: z.string().describe('ISO 8601')
  }),
  { title: 'MeRes', description: 'Thông tin tài khoản của chính mình (KHÔNG bao giờ chứa password)' }
)

export const UpdateMeBodySchema = extendApi(
  z
    .object({
      name: z.string().min(2).max(100).optional(),
      displayName: z.string().max(100).nullish().describe("Chuỗi rỗng '' = XOÁ; omit/null = giữ nguyên"),
      avatar: z.string().max(500).nullish().describe("Object key A7. Chuỗi rỗng '' = XOÁ; omit/null = giữ nguyên"),
      phoneNumber: PhoneNumberE164Schema.optional()
    })
    .strict(),
  {
    title: 'UpdateMeBody',
    description: 'Partial-update thông tin tài khoản. KHÔNG cho đổi email/role/status (strict → gửi lên = 422).'
  }
)

export type UpdateMeBodyType = z.infer<typeof UpdateMeBodySchema>

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
export type AdminUpdateUserStatusBodyType = z.infer<typeof AdminUpdateUserStatusBodySchema>
export type MangakaProfileBodyType = z.infer<typeof MangakaProfileBodySchema>
export type AssistantProfileBodyType = z.infer<typeof AssistantProfileBodySchema>

// ---- Part B (Spec 12): hồ sơ nhân sự NXB (EDITOR + BOARD_MEMBER) ----
export const StaffProfileBodySchema = extendApi(
  z
    .object({
      specialtyGenres: z
        .array(zEnum(Genre, 'Genre'))
        .default([])
        .describe('Sở trường thể loại — dùng để auto-assign Board vào phiên pitch (PB-05)'),
      demographics: z.array(zEnum(Demographic, 'Demographic')).default([]),
      bio: z.string().max(2000).optional(),
      yearsOfExperience: z.number().int().min(0).max(80).optional()
    })
    .strict(),
  { title: 'StaffProfileBody', description: 'Upsert hồ sơ Editor/Board Member' }
)

export const StaffProfileResSchema = extendApi(
  z.object({
    userId: z.string(),
    role: zRole(),
    specialtyGenres: z.array(zEnum(Genre, 'Genre')),
    demographics: z.array(zEnum(Demographic, 'Demographic')),
    bio: z.string().nullable(),
    yearsOfExperience: z.number().nullable(),
    displayName: z.string().nullable(),
    avatar: z.string().nullable(),
    hasProfile: z.boolean().describe('false = chưa build hồ sơ; field profile = default rỗng')
  }),
  { title: 'StaffProfileRes', description: 'Hồ sơ Editor/Board (public — ẩn email/phone)' }
)

export type StaffProfileBodyType = z.infer<typeof StaffProfileBodySchema>

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

// ---- Assistant directory (A-TSK-06) ----
export const ListAssistantsQuerySchema = extendApi(
  z
    .object({
      specialization: zEnum($Enums.Specialization, 'Specialization').optional(),
      level: z.string().min(1).max(100).optional(),
      availableFrom: z.string().datetime({ offset: true }).optional(),
      availableTo: z.string().datetime({ offset: true }).optional(),
      limit: z.coerce.number().int().positive().max(100).default(20),
      offset: z.coerce.number().int().nonnegative().default(0)
    })
    .strict(),
  { title: 'ListAssistantsQuery', description: 'Lọc danh bạ trợ lý (specialization/level/availability)' }
)

export const AssistantDirectoryItemSchema = extendApi(
  z.object({
    userId: z.string(),
    displayName: z.string().nullable(),
    avatar: z.string().nullable(),
    specializations: z.array(zEnum($Enums.Specialization, 'Specialization')),
    experienceLevel: z.string().nullable(),
    portfolioFiles: z.array(z.string()),
    availabilityStatus: zEnum($Enums.AvailabilityStatus, 'AvailabilityStatus').nullable(),
    availabilityFrom: z.string().nullable(),
    availabilityTo: z.string().nullable(),
    reputationScore: z.number(),
    ratingAvg: z.number(),
    ratingCount: z.number(),
    isRecommended: z.boolean()
  }),
  { title: 'AssistantDirectoryItem', description: 'Một trợ lý trong danh bạ (ẩn email/phone)' }
)

export const AssistantDirectoryListResSchema = extendApi(
  z.object({
    items: z.array(AssistantDirectoryItemSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number()
  }),
  { title: 'AssistantDirectoryListRes', description: 'Danh bạ trợ lý phân trang, ưu tiên isRecommended/reputation' }
)

export type ListAssistantsQueryType = z.infer<typeof ListAssistantsQuerySchema>
export type AssistantDirectoryItemType = z.infer<typeof AssistantDirectoryItemSchema>
