import { $Enums } from '@prisma/client'
import { UsersRepository } from './users.repo'

function makeRepo() {
  const prismaService = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn()
    },
    refreshToken: {
      deleteMany: jest.fn()
    },
    role: {
      findMany: jest.fn(),
      findFirst: jest.fn()
    },
    assistantProfile: {
      findMany: jest.fn(),
      count: jest.fn()
    },
    mangakaProfile: {
      findMany: jest.fn(),
      count: jest.fn()
    },
    series: { count: jest.fn().mockResolvedValue(0) },
    contract: { count: jest.fn().mockResolvedValue(0) },
    task: { count: jest.fn().mockResolvedValue(0) },
    studioAssignment: { count: jest.fn().mockResolvedValue(0) },
    boardDecision: { count: jest.fn().mockResolvedValue(0) }
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

describe('UsersRepository countActiveCommitments', () => {
  it('counts active series and fully executed contracts for a mangaka only', async () => {
    const { repo, prismaService } = makeRepo()
    prismaService.series.count.mockResolvedValue(1)
    prismaService.contract.count.mockResolvedValue(2)

    await expect(repo.countActiveCommitments('u1', $Enums.RoleCode.MANGAKA)).resolves.toMatchObject({
      activeSeries: 1,
      executedContracts: 2,
      total: 3
    })
    expect(prismaService.series.count).toHaveBeenCalledWith({
      where: {
        mangakaId: 'u1',
        status: { in: ['IN_REVIEW', 'READY_TO_PITCH', 'PITCHED', 'SERIALIZED', 'HIATUS', 'COMPLETING', 'CANCELLING'] }
      }
    })
    expect(prismaService.contract.count).toHaveBeenCalledWith({
      where: { mangakaId: 'u1', status: $Enums.ContractStatus.FULLY_EXECUTED }
    })
    expect(prismaService.task.count).not.toHaveBeenCalled()
  })

  it('counts only open tasks and active assignments for an assistant', async () => {
    const { repo, prismaService } = makeRepo()
    prismaService.task.count.mockResolvedValue(3)
    prismaService.studioAssignment.count.mockResolvedValue(1)

    await expect(repo.countActiveCommitments('u1', $Enums.RoleCode.ASSISTANT)).resolves.toMatchObject({
      openTasks: 3,
      activeAssignments: 1,
      total: 4
    })
    expect(prismaService.task.count).toHaveBeenCalledWith({
      where: {
        assistantId: 'u1',
        status: { in: ['ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED'] }
      }
    })
    expect(prismaService.series.count).not.toHaveBeenCalled()
  })

  it('counts pending decisions for a board member through the session roster', async () => {
    const { repo, prismaService } = makeRepo()
    prismaService.boardDecision.count.mockResolvedValue(2)

    await expect(repo.countActiveCommitments('u1', $Enums.RoleCode.BOARD_MEMBER)).resolves.toMatchObject({
      pendingBoardDecisions: 2,
      total: 2
    })
    expect(prismaService.boardDecision.count).toHaveBeenCalledWith({
      where: {
        result: { in: [$Enums.BoardDecisionResult.PENDING, $Enums.BoardDecisionResult.PENDING_QUORUM] },
        boardSession: { is: { allowedEditorIds: { has: 'u1' } } }
      }
    })
  })

  it('returns an empty summary for a role without moderation commitments', async () => {
    const { repo, prismaService } = makeRepo()

    await expect(repo.countActiveCommitments('u1', $Enums.RoleCode.SUPER_ADMIN)).resolves.toMatchObject({ total: 0 })
    expect(prismaService.series.count).not.toHaveBeenCalled()
  })
})

describe('UsersRepository admin trash filter', () => {
  it('onlyDeleted wins over includeDeleted and uses Mongo isSet:true', async () => {
    const { repo, prismaService } = makeRepo()
    prismaService.user.findMany.mockResolvedValue([])

    await repo.findUsersForAdmin({ onlyDeleted: true, includeDeleted: true }, { limit: 20, offset: 0 })

    expect(prismaService.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: { isSet: true } }) })
    )
  })
})

describe('UsersRepository — me (Spec 12)', () => {
  const USER_ID = '012345678901234567890123'

  it('findMeById filters soft-deleted with isSet:false (AGENTS §10)', async () => {
    const { repo, prismaService } = makeRepo()
    prismaService.user.findFirst.mockResolvedValue(null)
    await repo.findMeById(USER_ID)
    expect(prismaService.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID, deletedAt: { isSet: false } } })
    )
  })

  it('findMeById never selects password', async () => {
    const { repo, prismaService } = makeRepo()
    prismaService.user.findFirst.mockResolvedValue(null)
    await repo.findMeById(USER_ID)
    const arg = prismaService.user.findFirst.mock.calls[0][0]
    expect(arg.select.password).toBeUndefined()
  })

  it('updateMe writes only the given data', async () => {
    const { repo, prismaService } = makeRepo()
    prismaService.user.update.mockResolvedValue({})
    await repo.updateMe(USER_ID, { displayName: null })
    expect(prismaService.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID }, data: { displayName: null } })
    )
  })
})

describe('UsersRepository — directories (Spec 14)', () => {
  it('searches assistants by name/displayName only and applies the same profile where to list and count', async () => {
    const { repo, prismaService } = makeRepo()
    prismaService.role.findFirst.mockResolvedValue({ id: 'assistant-role' })
    prismaService.user.findMany.mockResolvedValue([{ id: 'assistant-1' }])
    prismaService.assistantProfile.findMany.mockResolvedValue([])
    prismaService.assistantProfile.count.mockResolvedValue(0)
    const filter = { q: 'saku', level: 'SENIOR' }

    await repo.findAssistantsForDirectory(filter, { limit: 20, offset: 0 })
    await repo.countAssistantsForDirectory(filter)

    for (const call of prismaService.user.findMany.mock.calls) {
      expect(call[0]).toEqual({
        where: {
          roleId: 'assistant-role',
          status: 'ACTIVE',
          deletedAt: { isSet: false },
          OR: [
            { name: { contains: 'saku', mode: 'insensitive' } },
            { displayName: { contains: 'saku', mode: 'insensitive' } }
          ]
        },
        select: { id: true }
      })
      expect(JSON.stringify(call[0])).not.toContain('email')
    }
    expect(prismaService.assistantProfile.findMany.mock.calls[0][0].where).toEqual(
      prismaService.assistantProfile.count.mock.calls[0][0].where
    )
  })

  it('combines active Mangaka ids with penName/name matching and keeps list/count filters consistent', async () => {
    const { repo, prismaService } = makeRepo()
    prismaService.role.findFirst.mockResolvedValue({ id: 'mangaka-role' })
    prismaService.user.findMany.mockImplementation(({ where }) =>
      Promise.resolve(where.OR ? [{ id: 'name-match' }] : [{ id: 'pen-match' }, { id: 'name-match' }])
    )
    prismaService.mangakaProfile.findMany.mockResolvedValue([])
    prismaService.mangakaProfile.count.mockResolvedValue(0)
    const filter = { q: 'saku', genre: 'ACTION' as const, level: 'SENIOR' }

    await repo.findMangakasForDirectory(filter, { limit: 10, offset: 5 })
    await repo.countMangakasForDirectory(filter)

    const expectedWhere = {
      userId: { in: ['pen-match', 'name-match'] },
      genres: { has: 'ACTION' },
      experienceLevel: 'SENIOR',
      OR: [{ penName: { contains: 'saku', mode: 'insensitive' } }, { userId: { in: ['name-match'] } }]
    }
    expect(prismaService.mangakaProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expectedWhere,
        include: { user: { select: { displayName: true, avatar: true } } }
      })
    )
    expect(prismaService.mangakaProfile.count).toHaveBeenCalledWith({ where: expectedWhere })
    for (const call of prismaService.user.findMany.mock.calls) {
      expect(call[0].where.deletedAt).toEqual({ isSet: false })
    }
  })
})
