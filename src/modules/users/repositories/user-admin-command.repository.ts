import { Prisma, RegistrationType, UserStatus } from '@prisma/client'
import { RoleNameType } from 'src/core/security/constants/role.constant'
import { PrismaService } from 'src/infrastructure/database/prisma.service'

export const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  displayName: true,
  phoneNumber: true,
  avatar: true,
  status: true,
  emailVerified: true,
  registrationType: true,
  mustChangePassword: true,
  createdAt: true,
  role: { select: { code: true } }
} satisfies Prisma.UserSelect

export class UserAdminCommandRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async getRoleIdByCode(code: RoleNameType): Promise<string> {
    const role = await this.prismaService.role.findUniqueOrThrow({ where: { code } })
    return role.id
  }

  createAdminUser(data: { email: string; name: string; phoneNumber: string; password: string; roleId: string }) {
    return this.prismaService.user.create({
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

  updateUserStatus(id: string, status: UserStatus) {
    return this.prismaService.user.update({ where: { id }, data: { status }, select: ADMIN_USER_SELECT })
  }

  softDeleteUser(id: string, deletedAt: Date) {
    return this.prismaService.user.update({ where: { id }, data: { deletedAt } })
  }

  restoreUser(id: string) {
    return this.prismaService.user.update({
      where: { id },
      data: { deletedAt: { unset: true } },
      select: ADMIN_USER_SELECT
    })
  }

  resetUserPassword(id: string, password: string) {
    return this.prismaService.user.update({ where: { id }, data: { password, mustChangePassword: true } })
  }

  revokeRefreshTokensByUserId(userId: string) {
    return this.prismaService.refreshToken.deleteMany({ where: { userId } })
  }
}
