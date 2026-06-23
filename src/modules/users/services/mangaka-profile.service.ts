import { Injectable } from '@nestjs/common'
import { ProfileNotFoundException } from '../errors/users.errors'
import { MangakaProfileBodyType } from '../schemas/users-schemas'
import { UsersRepository } from '../users.repo'

@Injectable()
export class MangakaProfileService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async upsertMyProfile(userId: string, body: MangakaProfileBodyType) {
    return await this.usersRepository.upsertMangakaProfile(userId, body)
  }

  async getByUserId(userId: string) {
    const profile = await this.usersRepository.findMangakaProfileByUserId(userId)
    if (!profile) throw ProfileNotFoundException

    const { user, ...rest } = profile
    return { ...rest, displayName: user?.displayName ?? null, avatar: user?.avatar ?? null }
  }
}
