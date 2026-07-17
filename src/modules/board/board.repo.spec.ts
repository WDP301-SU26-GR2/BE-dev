import { BoardRepository } from './board.repo'

describe('BoardRepository Spec 17 contracts', () => {
  const makeRepo = () => {
    const prisma = {
      boardConfig: {
        findFirst: jest.fn(),
        create: jest.fn()
      },
      boardDecision: {
        findMany: jest.fn()
      }
    }

    return { prisma, repo: new BoardRepository(prisma as never) }
  }

  describe('getActiveConfig lazy seed', () => {
    it('returns an existing config without creating another row', async () => {
      const { prisma, repo } = makeRepo()
      const existing = { id: 'config-1', quorumMin: 7 }
      prisma.boardConfig.findFirst.mockResolvedValue(existing)

      await expect(repo.getActiveConfig()).resolves.toBe(existing)
      expect(prisma.boardConfig.create).not.toHaveBeenCalled()
    })

    it('creates the default config when the collection is empty', async () => {
      const { prisma, repo } = makeRepo()
      const seeded = { id: 'config-1', quorumMin: 3 }
      prisma.boardConfig.findFirst.mockResolvedValue(null)
      prisma.boardConfig.create.mockResolvedValue(seeded)

      await expect(repo.getActiveConfig()).resolves.toBe(seeded)
      expect(prisma.boardConfig.create).toHaveBeenCalledWith({
        data: {
          boardTotalMembers: 5,
          quorumMin: 3,
          approveMajorityRatio: 0.5,
          isDefault: true
        }
      })
    })
  })

  describe('findManyDecisions filters', () => {
    it('combines boardSessionId and targetSeriesId in the Prisma where clause', async () => {
      const { prisma, repo } = makeRepo()
      prisma.boardDecision.findMany.mockResolvedValue([])

      await repo.findManyDecisions({ boardSessionId: 'session-1', targetSeriesId: 'series-1' })

      expect(prisma.boardDecision.findMany).toHaveBeenCalledWith({
        where: { boardSessionId: 'session-1', targetSeriesId: 'series-1' },
        orderBy: { id: 'desc' }
      })
    })
  })
})
