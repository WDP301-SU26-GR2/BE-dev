import { Injectable } from '@nestjs/common'
import { ProfileNotFoundException } from '../errors/users.errors'
import { AssistantProfileBodyType } from '../schemas/users-schemas'
import { UsersRepository } from '../users.repo'

@Injectable()
export class AssistantProfileService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async upsertMyProfile(userId: string, body: AssistantProfileBodyType) {
    const profile = await this.usersRepository.upsertAssistantProfile(userId, body)
    return this.toResponse(profile)
  }

  async getByUserId(userId: string) {
    const profile = await this.usersRepository.findAssistantProfileByUserId(userId)
    if (!profile) throw ProfileNotFoundException

    const { user, ...rest } = profile
    return { ...this.toResponse(rest), displayName: user?.displayName ?? null, avatar: user?.avatar ?? null }
  }

  // Dates are serialized as ISO 8601 strings (DTO contract is string, not z.date()).
  private toResponse<T extends { availabilityFrom: Date | null; availabilityTo: Date | null }>(profile: T) {
    return {
      ...profile,
      availabilityFrom: profile.availabilityFrom ? profile.availabilityFrom.toISOString() : null,
      availabilityTo: profile.availabilityTo ? profile.availabilityTo.toISOString() : null
    }
  }
}
