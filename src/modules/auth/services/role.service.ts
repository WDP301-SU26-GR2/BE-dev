import { Injectable } from '@nestjs/common'
import { RoleNameType } from 'src/core/security/constants/role.constant'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

@Injectable()
export class RoleService {
  private readonly roleIdCache = new Map<string, string>()

  constructor(private readonly prismaService: PrismaService) {}

  async getRoleIdByCode(code: RoleNameType): Promise<string> {
    const cached = this.roleIdCache.get(code)
    if (cached) return cached

    const role = await this.prismaService.role.findUniqueOrThrow({ where: { code } })
    this.roleIdCache.set(code, role.id)
    return role.id
  }
}
