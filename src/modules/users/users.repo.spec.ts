import { $Enums } from '@prisma/client'
import { UsersRepository } from './users.repo'

function makeRepo() {
  const prismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn()
    },
    refreshToken: {
      deleteMany: jest.fn()
    },
    role: {
      findMany: jest.fn()
    }
  }
  const repo = new UsersRepository(prismaService as never)
  return { repo, prismaService }
}

describe('UsersRepository PA-15 moderation helpers', () => {
  it('restores user with deletedAt unset, not null', async () => {
    const { repo, prismaService } = makeRepo()

    await repo.restoreUser('507f1f77bcf86cd799439011')

    // unset (về ABSENT) + select whitelist — KHÔNG deletedAt:null, KHÔNG trả password
    expect(prismaService.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '507f1f77bcf86cd799439011' },
        data: { deletedAt: { unset: true } },
        select: expect.not.objectContaining({ password: true })
      })
    )
  })

  it('revokes refresh tokens through refreshToken.deleteMany', async () => {
    const { repo, prismaService } = makeRepo()

    await repo.revokeRefreshTokensByUserId('507f1f77bcf86cd799439011')

    expect(prismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: '507f1f77bcf86cd799439011' }
    })
  })

  it('groups active users by status using Prisma groupBy', async () => {
    const { repo, prismaService } = makeRepo()

    await repo.groupUsersByStatus()

    expect(prismaService.user.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: { deletedAt: { isSet: false } },
      _count: { _all: true }
    })
  })

  it('groups users by roles from role collection', async () => {
    const { repo, prismaService } = makeRepo()
    prismaService.role.findMany.mockResolvedValue([{ id: 'role1', code: $Enums.RoleCode.EDITOR }])
    prismaService.user.groupBy.mockResolvedValue([{ roleId: 'role1', _count: { _all: 4 } }])

    const res = await repo.groupUsersByRole()

    expect(prismaService.role.findMany).toHaveBeenCalledWith({ select: { id: true, code: true } })
    expect(prismaService.user.groupBy).toHaveBeenCalledWith({
      by: ['roleId'],
      where: { deletedAt: { isSet: false } },
      _count: { _all: true }
    })
    expect(res).toEqual([{ role: { code: $Enums.RoleCode.EDITOR }, _count: { _all: 4 } }])
  })
})
