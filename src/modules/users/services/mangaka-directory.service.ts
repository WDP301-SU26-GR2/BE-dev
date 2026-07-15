import { Injectable } from '@nestjs/common'
import { ListMangakasQueryType, MangakaDirectoryItemType } from '../schemas/users-schemas'
import { UsersRepository } from '../users.repo'

type ProfileRow = {
  userId: string
  penName: string
  genres: string[]
  experienceLevel: string | null
  bio: string | null
  portfolioFiles: string[]
  reputationScore: number
  ratingAvg: number
  ratingCount: number
  isRecommended: boolean
  user: { displayName: string | null; avatar: string | null } | null
}

/** Spec 14 §3.2 — danh bạ Mangaka cho Editor/Board và tác giả tìm series gốc. */
@Injectable()
export class MangakaDirectoryService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async list(query: ListMangakasQueryType) {
    const filter = { q: query.q, genre: query.genre, level: query.level }
    const page = { limit: query.limit, offset: query.offset }
    const [rows, total] = await Promise.all([
      this.usersRepository.findMangakasForDirectory(filter, page),
      this.usersRepository.countMangakasForDirectory(filter)
    ])
    return {
      items: (rows as ProfileRow[]).map((row) => this.toItem(row)),
      total,
      limit: query.limit,
      offset: query.offset
    }
  }

  private toItem(row: ProfileRow): MangakaDirectoryItemType {
    return {
      userId: row.userId,
      displayName: row.user?.displayName ?? null,
      avatar: row.user?.avatar ?? null,
      penName: row.penName,
      genres: row.genres as MangakaDirectoryItemType['genres'],
      experienceLevel: row.experienceLevel,
      bio: row.bio,
      portfolioFiles: row.portfolioFiles,
      reputationScore: row.reputationScore,
      ratingAvg: row.ratingAvg,
      ratingCount: row.ratingCount,
      isRecommended: row.isRecommended
    }
  }
}
