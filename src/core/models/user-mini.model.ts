import { z } from 'zod'

export const USER_MINI_FIELDS = { id: true, name: true, displayName: true, avatar: true } as const
export type UserMiniRow = { id: string; name: string; displayName: string | null; avatar: string | null }

export const UserMiniSchema = z.object({
  id: z.string(),
  displayName: z.string().describe('displayName ?? name'),
  avatar: z.string().nullable()
})
export type UserMiniType = z.infer<typeof UserMiniSchema>

export const SeriesMiniSchema = z.object({ id: z.string(), title: z.string() })
export type SeriesMiniType = z.infer<typeof SeriesMiniSchema>

export const ChapterMiniSchema = z.object({
  id: z.string(),
  chapterNumber: z.number(),
  title: z.string().nullable()
})
export type ChapterMiniType = z.infer<typeof ChapterMiniSchema>

export const toUserMini = (user: UserMiniRow): UserMiniType => ({
  id: user.id,
  displayName: user.displayName ?? user.name,
  avatar: user.avatar ?? null
})

type PrismaLike = {
  user: { findMany: (args: any) => Promise<UserMiniRow[]> }
  series: { findMany: (args: any) => Promise<{ id: string; title: string }[]> }
}

const dedupe = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((id): id is string => !!id))]

// Soft-deleted users remain queryable so historical records keep their display names.
export async function fetchUserMiniMap(prisma: PrismaLike, ids: (string | null | undefined)[]) {
  const uniqueIds = dedupe(ids)
  if (uniqueIds.length === 0) return new Map<string, UserMiniType>()
  const rows = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: USER_MINI_FIELDS
  })
  return new Map(rows.map((row) => [row.id, toUserMini(row)]))
}

export async function fetchSeriesMiniMap(prisma: PrismaLike, ids: (string | null | undefined)[]) {
  const uniqueIds = dedupe(ids)
  if (uniqueIds.length === 0) return new Map<string, SeriesMiniType>()
  const rows = await prisma.series.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, title: true }
  })
  return new Map(rows.map((row) => [row.id, { id: row.id, title: row.title }]))
}
