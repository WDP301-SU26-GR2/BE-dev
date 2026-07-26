import { AvailabilityStatus, Prisma } from '@prisma/client'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { AssistantProfileBodyType, MangakaProfileBodyType, StaffProfileBodyType } from '../schemas/users-schemas'

const ME_SELECT = {
  id: true,
  email: true,
  name: true,
  displayName: true,
  avatar: true,
  phoneNumber: true,
  status: true,
  emailVerified: true,
  mustChangePassword: true,
  createdAt: true,
  role: { select: { code: true } }
} satisfies Prisma.UserSelect

export class UserProfileRepository {
  constructor(private readonly prismaService: PrismaService) {}

  upsertMangakaProfile(userId: string, data: MangakaProfileBodyType) {
    return this.prismaService.mangakaProfile.upsert({
      where: { userId },
      create: {
        userId,
        penName: data.penName,
        genres: data.genres,
        experienceLevel: data.experienceLevel ?? null,
        bio: data.bio ?? null,
        portfolioFiles: data.portfolioFiles
      },
      update: {
        penName: data.penName,
        genres: data.genres,
        experienceLevel: data.experienceLevel ?? null,
        bio: data.bio ?? null,
        portfolioFiles: data.portfolioFiles
      }
    })
  }

  findMangakaProfileByUserId(userId: string) {
    return this.prismaService.mangakaProfile.findUnique({
      where: { userId },
      include: { user: { select: { displayName: true, avatar: true } } }
    })
  }

  findUserBasicsWithRole(userId: string) {
    return this.prismaService.user.findFirst({
      where: { id: userId, deletedAt: { isSet: false } },
      select: { id: true, displayName: true, avatar: true, role: { select: { code: true } } }
    })
  }

  findMeById(userId: string) {
    return this.prismaService.user.findFirst({
      where: { id: userId, deletedAt: { isSet: false } },
      select: ME_SELECT
    })
  }

  updateMe(userId: string, data: Prisma.UserUpdateInput) {
    return this.prismaService.user.update({ where: { id: userId }, data, select: ME_SELECT })
  }

  upsertAssistantProfile(userId: string, data: AssistantProfileBodyType) {
    return this.prismaService.assistantProfile.upsert({
      where: { userId },
      create: {
        userId,
        specializations: data.specializations,
        experienceLevel: data.experienceLevel ?? null,
        portfolioFiles: data.portfolioFiles,
        availabilityStatus: data.availabilityStatus ?? AvailabilityStatus.AVAILABLE,
        availabilityFrom: data.availabilityFrom ? new Date(data.availabilityFrom) : null,
        availabilityTo: data.availabilityTo ? new Date(data.availabilityTo) : null
      },
      update: {
        specializations: data.specializations,
        experienceLevel: data.experienceLevel ?? null,
        portfolioFiles: data.portfolioFiles,
        availabilityStatus: data.availabilityStatus,
        availabilityFrom: data.availabilityFrom ? new Date(data.availabilityFrom) : null,
        availabilityTo: data.availabilityTo ? new Date(data.availabilityTo) : null
      }
    })
  }

  findAssistantProfileByUserId(userId: string) {
    return this.prismaService.assistantProfile.findUnique({
      where: { userId },
      include: { user: { select: { displayName: true, avatar: true } } }
    })
  }

  upsertStaffProfile(userId: string, data: StaffProfileBodyType) {
    return this.prismaService.staffProfile.upsert({
      where: { userId },
      create: {
        userId,
        specialtyGenres: data.specialtyGenres,
        demographics: data.demographics,
        bio: data.bio ?? null,
        yearsOfExperience: data.yearsOfExperience ?? null
      },
      update: {
        specialtyGenres: data.specialtyGenres,
        demographics: data.demographics,
        bio: data.bio ?? null,
        yearsOfExperience: data.yearsOfExperience ?? null
      }
    })
  }

  findStaffProfileByUserId(userId: string) {
    return this.prismaService.staffProfile.findUnique({
      where: { userId },
      include: { user: { select: { displayName: true, avatar: true, role: { select: { code: true } } } } }
    })
  }

  async updateMangakaReputation(
    userId: string,
    data: { ratingAvg: number; ratingCount: number; reputationScore: number; isRecommended: boolean }
  ): Promise<void> {
    await this.prismaService.mangakaProfile.update({ where: { userId }, data })
  }

  async updateAssistantReputation(
    userId: string,
    data: { ratingAvg: number; ratingCount: number; reputationScore: number; isRecommended: boolean }
  ): Promise<void> {
    await this.prismaService.assistantProfile.update({ where: { userId }, data })
  }
}
