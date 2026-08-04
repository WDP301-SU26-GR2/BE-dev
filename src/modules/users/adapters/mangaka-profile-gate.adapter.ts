import { Injectable } from '@nestjs/common'
import { MangakaProfileGatePort } from 'src/modules/series/ports/mangaka-profile-gate.port'
import { UsersRepository } from '../users.repo'

/** Users module bind năng lực "mangaka đã build hồ sơ chưa" cho series (gate submit proposal). */
@Injectable()
export class MangakaProfileGateAdapter implements MangakaProfileGatePort {
  constructor(private readonly usersRepository: UsersRepository) {}

  hasProfile(userId: string): Promise<boolean> {
    return this.usersRepository.mangakaProfileExists(userId)
  }
}
