import { $Enums } from '@prisma/client'
import { BoardRepository } from './board.repo'

function makePrisma() {
  return {
    boardSession: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    boardConfig: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    boardDecision: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn()
    },
    seriesReport: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn()
    },
    series: {
      findFirst: jest.fn(),
      findMany: jest.fn()
    },
    role: {
      findUnique: jest.fn()
    },
    user: {
      findMany: jest.fn()
    },
    boardMessage: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn()
    },
    $transaction: jest.fn()
  }
}

describe('BoardRepository Prisma contracts', () => {
  it('performs independent entity lookups by id', async () => {
    const prisma = makePrisma()
    const repo = new BoardRepository(prisma as never)
    prisma.boardSession.findUnique.mockResolvedValue({ id: 'session' })
    prisma.boardConfig.findUnique.mockResolvedValue({ id: 'config' })
    prisma.boardDecision.findUnique.mockResolvedValue({ id: 'decision' })
    prisma.seriesReport.findUnique.mockResolvedValue({ id: 'report' })

    await expect(repo.findSessionById('session')).resolves.toEqual({ id: 'session' })
    await expect(repo.findConfigById('config')).resolves.toEqual({ id: 'config' })
    await expect(repo.findDecisionById('decision')).resolves.toEqual({ id: 'decision' })
    await expect(repo.findReportById('report')).resolves.toEqual({ id: 'report' })
    expect(prisma.boardSession.findUnique).toHaveBeenCalledWith({ where: { id: 'session' } })
    expect(prisma.boardConfig.findUnique).toHaveBeenCalledWith({ where: { id: 'config' } })
    expect(prisma.boardDecision.findUnique).toHaveBeenCalledWith({ where: { id: 'decision' } })
    expect(prisma.seriesReport.findUnique).toHaveBeenCalledWith({ where: { id: 'report' } })
  })

  it.each([
    {
      filter: undefined,
      where: {}
    },
    {
      filter: { participantId: 'member' },
      where: { OR: [{ creatorId: 'member' }, { allowedEditorIds: { has: 'member' } }] }
    },
    {
      filter: { status: $Enums.BoardSessionStatus.ACTIVE },
      where: { status: $Enums.BoardSessionStatus.ACTIVE }
    },
    {
      filter: { participantId: 'member', status: $Enums.BoardSessionStatus.CONCLUDED },
      where: {
        OR: [{ creatorId: 'member' }, { allowedEditorIds: { has: 'member' } }],
        status: $Enums.BoardSessionStatus.CONCLUDED
      }
    }
  ])('builds the session visibility filter %#', async ({ filter, where }) => {
    const prisma = makePrisma()
    const repo = new BoardRepository(prisma as never)

    await repo.findManySessions(filter)

    expect(prisma.boardSession.findMany).toHaveBeenCalledWith({
      where,
      orderBy: { startTime: 'desc' }
    })
  })

  it.each([
    { filter: undefined, where: {} },
    { filter: { boardSessionId: 'session' }, where: { boardSessionId: 'session' } },
    { filter: { targetSeriesId: 'series' }, where: { targetSeriesId: 'series' } }
  ])('builds optional decision filters %#', async ({ filter, where }) => {
    const prisma = makePrisma()
    const repo = new BoardRepository(prisma as never)

    await repo.findManyDecisions(filter)

    expect(prisma.boardDecision.findMany).toHaveBeenCalledWith({ where, orderBy: { id: 'desc' } })
  })

  it.each([
    { filter: undefined, where: {} },
    { filter: { seriesId: 'series' }, where: { seriesId: 'series' } },
    { filter: { boardDecisionId: 'decision' }, where: { boardDecisionId: 'decision' } },
    {
      filter: { seriesId: 'series', boardDecisionId: 'decision' },
      where: { seriesId: 'series', boardDecisionId: 'decision' }
    }
  ])('builds optional report filters %#', async ({ filter, where }) => {
    const prisma = makePrisma()
    const repo = new BoardRepository(prisma as never)

    await repo.findManyReports(filter)

    expect(prisma.seriesReport.findMany).toHaveBeenCalledWith({
      where,
      orderBy: { createdAt: 'desc' }
    })
  })

  it('queries sessions eligible for automatic start and automatic conclusion', async () => {
    const prisma = makePrisma()
    const repo = new BoardRepository(prisma as never)

    await repo.findExpiredUpcomingSessions()
    await repo.findExpiredActiveSessions()

    expect(prisma.boardSession.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        status: 'UPCOMING',
        startTime: { lte: expect.any(Date) }
      }
    })
    expect(prisma.boardSession.findMany).toHaveBeenNthCalledWith(2, {
      where: { status: 'ACTIVE', endTime: { not: null, lt: expect.any(Date) } },
      select: { id: true, title: true }
    })
  })

  it('queries title conflicts and the currently open session by explicit active statuses', async () => {
    const prisma = makePrisma()
    const repo = new BoardRepository(prisma as never)

    await repo.findActiveSessionByTitle('Planning')
    await repo.findFirstOpenSession()

    expect(prisma.boardSession.findFirst).toHaveBeenNthCalledWith(1, {
      where: { title: 'Planning', status: { in: ['UPCOMING', 'ACTIVE'] } }
    })
    expect(prisma.boardSession.findFirst).toHaveBeenNthCalledWith(2, { where: { status: 'ACTIVE' } })
  })

  it.each([
    {
      dto: {
        title: 'Required only',
        startTime: new Date('2026-07-25T10:00:00.000Z')
      },
      expected: {
        title: 'Required only',
        description: null,
        creatorId: 'creator',
        status: 'UPCOMING',
        allowedEditorIds: ['a', 'b', 'c'],
        startTime: new Date('2026-07-25T10:00:00.000Z'),
        endTime: null
      }
    },
    {
      dto: {
        title: 'Full',
        description: 'Agenda',
        startTime: new Date('2026-07-25T10:00:00.000Z'),
        endTime: new Date('2026-07-25T11:00:00.000Z')
      },
      expected: {
        title: 'Full',
        description: 'Agenda',
        creatorId: 'creator',
        status: 'UPCOMING',
        allowedEditorIds: ['a', 'b', 'c'],
        startTime: new Date('2026-07-25T10:00:00.000Z'),
        endTime: new Date('2026-07-25T11:00:00.000Z')
      }
    }
  ])('persists normalized session defaults %#', async ({ dto, expected }) => {
    const prisma = makePrisma()
    const repo = new BoardRepository(prisma as never)

    await repo.createSession('creator', dto, ['a', 'b', 'c'])

    expect(prisma.boardSession.create).toHaveBeenCalledWith({ data: expected })
  })

  it('keeps manual and automatic session transitions explicit', async () => {
    const prisma = makePrisma()
    const repo = new BoardRepository(prisma as never)

    await repo.updateSessionStatus('session', $Enums.BoardSessionStatus.ACTIVE)
    await repo.updateSessionStatusByAuto('session', $Enums.BoardSessionStatus.CONCLUDED)
    await repo.updateSessionPhase('session', $Enums.BoardSessionPhase.VOTING)

    expect(prisma.boardSession.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'session' },
      data: { status: $Enums.BoardSessionStatus.ACTIVE }
    })
    expect(prisma.boardSession.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'session' },
      data: { status: $Enums.BoardSessionStatus.CONCLUDED }
    })
    expect(prisma.boardSession.update).toHaveBeenNthCalledWith(3, {
      where: { id: 'session' },
      data: { phase: $Enums.BoardSessionPhase.VOTING }
    })
  })

  it.each([
    {
      dto: {
        boardSessionId: 'session',
        decisionType: $Enums.DecisionType.SERIALIZATION,
        targetSeriesId: undefined,
        details: undefined
      },
      targetSeriesId: null,
      details: null
    },
    {
      dto: {
        boardSessionId: 'session',
        decisionType: $Enums.DecisionType.TRANSFER,
        targetSeriesId: 'series',
        details: { reason: 'Approved ownership change' }
      },
      targetSeriesId: 'series',
      details: { reason: 'Approved ownership change' }
    }
  ])('creates a pending decision with immutable zeroed counters %#', async ({ dto, targetSeriesId, details }) => {
    const prisma = makePrisma()
    const repo = new BoardRepository(prisma as never)

    await repo.createDecision(dto as never)

    expect(prisma.boardDecision.create).toHaveBeenCalledWith({
      data: {
        boardSessionId: 'session',
        targetSeriesId,
        decisionType: dto.decisionType,
        details,
        result: 'PENDING',
        approveCount: 0,
        rejectCount: 0,
        totalVotes: 0,
        quorumMet: false,
        votes: []
      }
    })
  })

  it('appends a vote, updates counters, and restricts the non-terminal decision query', async () => {
    const prisma = makePrisma()
    const repo = new BoardRepository(prisma as never)
    const vote = {
      voterId: 'member',
      voteValue: $Enums.VoteValue.APPROVE,
      note: null,
      votedAt: new Date()
    }
    const counters = { approveCount: { increment: 1 } }

    await repo.pushVoteToDecision('decision', vote)
    await repo.updateDecisionCounters('decision', counters)
    await repo.findNonTerminalDecisionsBySession('session')

    expect(prisma.boardDecision.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'decision' },
      data: { votes: { push: vote } }
    })
    expect(prisma.boardDecision.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'decision' },
      data: counters
    })
    expect(prisma.boardDecision.findMany).toHaveBeenCalledWith({
      where: {
        boardSessionId: 'session',
        OR: [{ result: null }, { result: { in: ['PENDING', 'PENDING_QUORUM'] } }]
      },
      select: { id: true, result: true }
    })
  })

  it.each([
    { attachments: undefined, expected: [] },
    { attachments: ['minutes.pdf'], expected: ['minutes.pdf'] }
  ])('normalizes optional report attachments %#', async ({ attachments, expected }) => {
    const prisma = makePrisma()
    const repo = new BoardRepository(prisma as never)

    await repo.createSeriesReport({
      seriesId: 'series',
      boardDecisionId: 'decision',
      preparedBy: 'editor',
      reportType: 'PERFORMANCE',
      content: 'Analysis',
      attachments
    } as never)

    expect(prisma.seriesReport.create).toHaveBeenCalledWith({
      data: {
        seriesId: 'series',
        boardDecisionId: 'decision',
        preparedBy: 'editor',
        reportType: 'PERFORMANCE',
        content: 'Analysis',
        attachments: expected
      }
    })
  })

  it('updates board governance config with actor attribution and server time', async () => {
    const prisma = makePrisma()
    const repo = new BoardRepository(prisma as never)

    await repo.updateConfig('config', {
      boardTotalMembers: 7,
      quorumMin: 5,
      approveMajorityRatio: 0.6,
      updatedBy: 'admin'
    })

    expect(prisma.boardConfig.update).toHaveBeenCalledWith({
      where: { id: 'config' },
      data: {
        boardTotalMembers: 7,
        quorumMin: 5,
        approveMajorityRatio: 0.6,
        updatedBy: 'admin',
        updatedAt: expect.any(Date)
      }
    })
  })

  it('queries genres, role identity, and only active non-deleted board members', async () => {
    const prisma = makePrisma()
    const repo = new BoardRepository(prisma as never)
    prisma.role.findUnique.mockResolvedValueOnce({ id: 'role' }).mockResolvedValueOnce(null)

    await repo.findSeriesGenres('series')
    await expect(repo.findRoleIdByCode('BOARD_MEMBER')).resolves.toBe('role')
    await expect(repo.findRoleIdByCode('MISSING')).resolves.toBeNull()
    await repo.findActiveBoardMembers('role')

    expect(prisma.series.findFirst).toHaveBeenCalledWith({
      where: { id: 'series' },
      select: { id: true, genres: true }
    })
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { roleId: 'role', status: 'ACTIVE', deletedAt: { isSet: false } },
      select: {
        id: true,
        displayName: true,
        avatar: true,
        createdAt: true,
        staffProfile: { select: { specialtyGenres: true } }
      }
    })
  })

  it('creates phase-attributed messages and paginates message history atomically', async () => {
    const prisma = makePrisma()
    const repo = new BoardRepository(prisma as never)
    const data = {
      sessionId: 'session',
      senderId: 'member',
      content: 'Ready',
      phase: $Enums.BoardSessionPhase.QA
    }
    prisma.boardMessage.findMany.mockReturnValue('items-query')
    prisma.boardMessage.count.mockReturnValue('count-query')
    prisma.$transaction.mockResolvedValue([[{ id: 'message' }], 1])

    await repo.createBoardMessage(data)
    await expect(repo.findMessagesBySession('session', { limit: 10, offset: 20 })).resolves.toEqual({
      items: [{ id: 'message' }],
      total: 1
    })

    expect(prisma.boardMessage.create).toHaveBeenCalledWith({ data })
    expect(prisma.boardMessage.findMany).toHaveBeenCalledWith({
      where: { sessionId: 'session' },
      orderBy: { createdAt: 'asc' },
      skip: 20,
      take: 10
    })
    expect(prisma.$transaction).toHaveBeenCalledWith(['items-query', 'count-query'])
  })

  it('short-circuits empty enrichment lookups and batches non-empty ids', async () => {
    const prisma = makePrisma()
    const repo = new BoardRepository(prisma as never)

    await expect(repo.findUsersMiniByIds([])).resolves.toEqual([])
    await expect(repo.findSeriesTitlesByIds([])).resolves.toEqual([])
    expect(prisma.user.findMany).not.toHaveBeenCalled()
    expect(prisma.series.findMany).not.toHaveBeenCalled()

    await repo.findUsersMiniByIds(['u1', 'u2'])
    await repo.findSeriesTitlesByIds(['s1'])

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['u1', 'u2'] } },
      select: { id: true, name: true, displayName: true, avatar: true }
    })
    expect(prisma.series.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['s1'] } },
      select: { id: true, title: true }
    })
  })
})
