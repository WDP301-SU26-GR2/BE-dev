import { Injectable } from '@nestjs/common'
import { ProfileNotFoundException } from '../errors/users.errors'
import { AssistantProfileBodyType } from '../schemas/users-schemas'
import { UsersRepository } from '../users.repo'
import { RoleName } from 'src/core/security/constants/role.constant'

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

@Injectable()
export class AssistantProfileService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async upsertMyProfile(userId: string, body: AssistantProfileBodyType) {
    await this.usersRepository.upsertAssistantProfile(userId, body)
    return this.getByUserId(userId)
  }

  async getByUserId(userId: string) {
    if (!OBJECT_ID_RE.test(userId)) throw ProfileNotFoundException

    const profile = await this.usersRepository.findAssistantProfileByUserId(userId)
    if (profile) {
      const { user, ...rest } = profile
      return {
        ...this.toResponse(rest),
        displayName: user?.displayName ?? null,
        avatar: user?.avatar ?? null,
        hasProfile: true
      }
    }

    const user = await this.usersRepository.findUserBasicsWithRole(userId)
    if (!user || user.role.code !== RoleName.ASSISTANT) throw ProfileNotFoundException

    return {
      userId,
      specializations: [],
      experienceLevel: null,
      portfolioFiles: [],
      availabilityStatus: null,
      availabilityFrom: null,
      availabilityTo: null,
      reputationScore: 0,
      ratingAvg: 0,
      ratingCount: 0,
      isRecommended: false,
      displayName: user.displayName ?? null,
      avatar: user.avatar ?? null,
      hasProfile: false
    }
  }

  // Dates are serialized as ISO 8601 strings (DTO contract is string, not z.date()).
  private toResponse<T extends { availabilityFrom: Date | null; availabilityTo: Date | null }>(profile: T) {
    return {
      ...profile,
      availabilityFrom: profile.availabilityFrom ? profile.availabilityFrom.toISOString() : null,
      availabilityTo: profile.availabilityTo ? profile.availabilityTo.toISOString() : null
    }
  }

  async applyReputation(
    userId: string,
    data: { ratingAvg: number; ratingCount: number; reputationScore: number; isRecommended: boolean }
  ): Promise<void> {
    await this.usersRepository.updateAssistantReputation(userId, data)
  }
}
