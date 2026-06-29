import { Injectable } from '@nestjs/common'
import { ProfileNotFoundException } from '../errors/users.errors'
import { MangakaProfileBodyType } from '../schemas/users-schemas'
import { UsersRepository } from '../users.repo'
import { RoleName } from 'src/core/security/constants/role.constant'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class MangakaProfileService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async upsertMyProfile(userId: string, body: MangakaProfileBodyType) {
    await this.usersRepository.upsertMangakaProfile(userId, body)
    return this.getByUserId(userId)
  }

  async getByUserId(userId: string) {
    if (!OBJECT_ID_RE.test(userId)) throw ProfileNotFoundException

    const profile = await this.usersRepository.findMangakaProfileByUserId(userId)
    if (profile) {
      const { user, ...rest } = profile
      return { ...rest, displayName: user?.displayName ?? null, avatar: user?.avatar ?? null, hasProfile: true }
    }

    const user = await this.usersRepository.findUserBasicsWithRole(userId)
    if (!user || user.role.code !== RoleName.MANGAKA) throw ProfileNotFoundException

    return {
      userId,
      penName: null,
      genres: [],
      experienceLevel: null,
      bio: null,
      portfolioFiles: [],
      reputationScore: 0,
      ratingAvg: 0,
      ratingCount: 0,
      isRecommended: false,
      displayName: user.displayName ?? null,
      avatar: user.avatar ?? null,
      hasProfile: false
    }
  }

  async applyReputation(
    userId: string,
    data: { ratingAvg: number; ratingCount: number; reputationScore: number; isRecommended: boolean }
  ): Promise<void> {
    await this.usersRepository.updateMangakaReputation(userId, data)
  }
}
