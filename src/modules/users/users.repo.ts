import { Injectable } from '@nestjs/common'
import { AvailabilityStatus, RegistrationType, UserStatus } from '@prisma/client'
import { RoleNameType } from 'src/core/security/role.constant'
import { PrismaService } from 'src/infrastructure/database/prisma.service'
import { AssistantProfileBodyType, MangakaProfileBodyType } from './schemas/users-schemas'

@Injectable()
export class UsersRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async getRoleIdByCode(code: RoleNameType): Promise<string> {
    const role = await this.prismaService.role.findUniqueOrThrow({ where: { code } })
    return role.id
  }

  async createAdminUser(data: { email: string; name: string; phoneNumber: string; password: string; roleId: string }) {
    return await this.prismaService.user.create({
      data: {
        ...data,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        registrationType: RegistrationType.ADMIN_CREATED,
        mustChangePassword: true
      },
      omit: { password: true }
    })
  }

  async upsertMangakaProfile(userId: string, data: MangakaProfileBodyType) {
    return await this.prismaService.mangakaProfile.upsert({
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

  async findMangakaProfileByUserId(userId: string) {
    return await this.prismaService.mangakaProfile.findUnique({
      where: { userId },
      include: { user: { select: { displayName: true, avatar: true } } }
    })
  }

  async upsertAssistantProfile(userId: string, data: AssistantProfileBodyType) {
    return await this.prismaService.assistantProfile.upsert({
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

  async findAssistantProfileByUserId(userId: string) {
    return await this.prismaService.assistantProfile.findUnique({
      where: { userId },
      include: { user: { select: { displayName: true, avatar: true } } }
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
