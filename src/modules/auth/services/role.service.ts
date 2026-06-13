import { Injectable } from '@nestjs/common'
import { RoleName } from 'src/shared/constant/role.constant'
import { PrismaService } from 'src/shared/services/prisma.service'

@Injectable()
export class RoleService {
  private mangakaRoleId: string | null = null
  private assistantRoleId: string | null = null

  constructor(private readonly prismaService: PrismaService) {}

  async getMangakaRoleId(): Promise<string> {
    if (this.mangakaRoleId !== null) {
      return this.mangakaRoleId
    }

    this.mangakaRoleId = await this.prismaService.role
      .findUniqueOrThrow({
        where: {
          code: RoleName.MANGAKA
        }
      })
      .then((role) => role.id)

    return this.mangakaRoleId as string
  }

  async getAssistantRoleId(): Promise<string> {
    if (this.assistantRoleId !== null) {
      return this.assistantRoleId
    }

    this.assistantRoleId = await this.prismaService.role
      .findUniqueOrThrow({
        where: {
          code: RoleName.ASSISTANT
        }
      })
      .then((role) => role.id)

    return this.assistantRoleId as string
  }
}
