import { Injectable } from '@nestjs/common'
import { AssistantDirectoryItemType, ListAssistantsQueryType } from '../schemas/users-schemas'
import { UsersRepository } from '../users.repo'

type ProfileRow = {
  userId: string
  specializations: string[]
  experienceLevel: string | null
  portfolioFiles: string[]
  availabilityStatus: string | null
  availabilityFrom: Date | null
  availabilityTo: Date | null
  reputationScore: number
  ratingAvg: number
  ratingCount: number
  isRecommended: boolean
  user: { displayName: string | null; avatar: string | null } | null
}

@Injectable()
export class AssistantDirectoryService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async list(query: ListAssistantsQueryType) {
    const filter = {
      q: query.q,
      specialization: query.specialization,
      level: query.level,
      availableFrom: query.availableFrom,
      availableTo: query.availableTo
    }
    const page = { limit: query.limit, offset: query.offset }
    const [rows, total] = await Promise.all([
      this.usersRepository.findAssistantsForDirectory(filter, page),
      this.usersRepository.countAssistantsForDirectory(filter)
    ])
    return {
      items: (rows as ProfileRow[]).map((r) => this.toItem(r)),
      total,
      limit: query.limit,
      offset: query.offset
    }
  }

  private toItem(r: ProfileRow): AssistantDirectoryItemType {
    return {
      userId: r.userId,
      displayName: r.user?.displayName ?? null,
      avatar: r.user?.avatar ?? null,
      specializations: r.specializations as AssistantDirectoryItemType['specializations'],
      experienceLevel: r.experienceLevel,
      portfolioFiles: r.portfolioFiles,
      availabilityStatus: r.availabilityStatus as AssistantDirectoryItemType['availabilityStatus'],
      availabilityFrom: r.availabilityFrom ? r.availabilityFrom.toISOString() : null,
      availabilityTo: r.availabilityTo ? r.availabilityTo.toISOString() : null,
      reputationScore: r.reputationScore,
      ratingAvg: r.ratingAvg,
      ratingCount: r.ratingCount,
      isRecommended: r.isRecommended
    }
  }
}
