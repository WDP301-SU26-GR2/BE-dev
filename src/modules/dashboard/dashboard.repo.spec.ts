import { $Enums } from '@prisma/client'
import { DashboardRepository } from './dashboard.repo'

function makeRepo() {
  const prisma = {
    paymentRecord: { findMany: jest.fn() },
    task: { groupBy: jest.fn() },
    studioAssignment: { count: jest.fn() },
    assistantProfile: { findFirst: jest.fn() },
    series: { count: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() },
    contract: { findMany: jest.fn() },
    rankingRecord: { findMany: jest.fn() },
    boardSession: { findMany: jest.fn(), count: jest.fn() },
    boardDecision: { findMany: jest.fn() }
  }
  return { repo: new DashboardRepository(prisma as never), prisma }
}

describe('DashboardRepository role-dashboard read models', () => {
  it('loads Mangaka earnings newest first', async () => {
    const { repo, prisma } = makeRepo()
    prisma.paymentRecord.findMany.mockResolvedValue([])

    await repo.earningsForMangaka('mangaka-1')

    expect(prisma.paymentRecord.findMany).toHaveBeenCalledWith({
      where: { receiverId: 'mangaka-1' },
      orderBy: { createdAt: 'desc' }
    })
  })

  it('groups an Assistant workload and reads the reputation projection', async () => {
    const { repo, prisma } = makeRepo()
    prisma.task.groupBy.mockResolvedValue([])
    prisma.assistantProfile.findFirst.mockResolvedValue(null)

    await repo.assistantTaskCounts('assistant-1')
    await repo.assistantReputation('assistant-1')

    expect(prisma.task.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: { assistantId: 'assistant-1' },
      _count: { _all: true }
    })
    expect(prisma.assistantProfile.findFirst).toHaveBeenCalledWith({
      where: { userId: 'assistant-1' },
      select: { ratingAvg: true, ratingCount: true, reputationScore: true, isRecommended: true }
    })
  })

  it('counts active assignments with an absent hireEnd or a non-ended hireEnd', async () => {
    const { repo, prisma } = makeRepo()
    const now = new Date('2026-07-18T00:00:00.000Z')
    prisma.studioAssignment.count.mockResolvedValue(0)

    await repo.assistantActiveAssignmentCount('assistant-1', now)

    expect(prisma.studioAssignment.count).toHaveBeenCalledWith({
      where: {
        assistantId: 'assistant-1',
        status: $Enums.StudioAssignmentStatus.ACTIVE,
        OR: [{ hireEnd: { isSet: false } }, { hireEnd: { gte: now } }]
      }
    })
  })

  it('uses isSet:false for the unclaimed Editor review queue', async () => {
    const { repo, prisma } = makeRepo()
    prisma.series.count.mockResolvedValue(0)

    await repo.editorReviewQueueCount()

    expect(prisma.series.count).toHaveBeenCalledWith({
      where: { status: $Enums.SeriesStatus.IN_REVIEW, editorId: { isSet: false } }
    })
  })

  it('loads Editor series aggregates, ranking identities and six non-terminal contracts', async () => {
    const { repo, prisma } = makeRepo()
    prisma.series.groupBy.mockResolvedValue([])
    prisma.series.findMany.mockResolvedValue([])
    prisma.contract.findMany.mockResolvedValue([])

    await repo.editorSeriesByStatus('editor-1')
    await repo.editorSeriesForRanking('editor-1')
    await repo.editorPendingContracts('editor-1')

    expect(prisma.series.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: { editorId: 'editor-1' },
      _count: { _all: true }
    })
    expect(prisma.series.findMany).toHaveBeenCalledWith({
      where: { editorId: 'editor-1' },
      select: { id: true, title: true }
    })
    expect(prisma.contract.findMany).toHaveBeenCalledWith({
      where: {
        editorId: 'editor-1',
        status: {
          in: [
            $Enums.ContractStatus.DRAFT,
            $Enums.ContractStatus.MANGAKA_REVIEW,
            $Enums.ContractStatus.MANGAKA_APPROVED,
            $Enums.ContractStatus.BOARD_APPROVED,
            $Enums.ContractStatus.NEGOTIATION,
            $Enums.ContractStatus.MANGAKA_SIGNED
          ]
        }
      },
      select: { id: true, seriesId: true, status: true },
      orderBy: { id: 'desc' }
    })
  })

  it('deduplicates ranking rows after ordering newest first', async () => {
    const { repo, prisma } = makeRepo()
    const newestA = { id: 'rank-a2', seriesId: 'series-a', riskLevel: $Enums.RiskLevel.SEVERE }
    const olderA = { id: 'rank-a1', seriesId: 'series-a', riskLevel: $Enums.RiskLevel.NONE }
    const newestB = { id: 'rank-b1', seriesId: 'series-b', riskLevel: $Enums.RiskLevel.MODERATE }
    prisma.rankingRecord.findMany.mockResolvedValue([newestA, olderA, newestB])

    await expect(repo.latestRankingForSeries(['series-a', 'series-b'])).resolves.toEqual([newestA, newestB])
    expect(prisma.rankingRecord.findMany).toHaveBeenCalledWith({
      where: { seriesId: { in: ['series-a', 'series-b'] } },
      orderBy: { recordedAt: 'desc' }
    })
  })

  it('short-circuits empty series lookups', async () => {
    const { repo, prisma } = makeRepo()

    await expect(repo.latestRankingForSeries([])).resolves.toEqual([])
    await expect(repo.seriesTitles([])).resolves.toEqual([])

    expect(prisma.rankingRecord.findMany).not.toHaveBeenCalled()
    expect(prisma.series.findMany).not.toHaveBeenCalled()
  })

  it('loads only ids and titles for requested series', async () => {
    const { repo, prisma } = makeRepo()
    prisma.series.findMany.mockResolvedValue([])

    await repo.seriesTitles(['series-a', 'series-b'])

    expect(prisma.series.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['series-a', 'series-b'] } },
      select: { id: true, title: true }
    })
  })

  it('loads Board sessions for the member roster and pending decisions only', async () => {
    const { repo, prisma } = makeRepo()
    prisma.boardSession.findMany.mockResolvedValue([])
    prisma.boardSession.count.mockResolvedValue(0)
    prisma.boardDecision.findMany.mockResolvedValue([])

    await repo.boardActiveSessions('board-1')
    await repo.boardUpcomingSessionCount('board-1')
    await repo.pendingDecisionsBySessions(['session-1'])

    expect(prisma.boardSession.findMany).toHaveBeenCalledWith({
      where: { status: $Enums.BoardSessionStatus.ACTIVE, allowedEditorIds: { has: 'board-1' } },
      select: { id: true, phase: true }
    })
    expect(prisma.boardSession.count).toHaveBeenCalledWith({
      where: { status: $Enums.BoardSessionStatus.UPCOMING, allowedEditorIds: { has: 'board-1' } }
    })
    expect(prisma.boardDecision.findMany).toHaveBeenCalledWith({
      where: {
        boardSessionId: { in: ['session-1'] },
        result: { in: [$Enums.BoardDecisionResult.PENDING, $Enums.BoardDecisionResult.PENDING_QUORUM] }
      },
      select: { id: true, boardSessionId: true, decisionType: true, targetSeriesId: true, result: true }
    })
  })

  it('short-circuits pending decisions for no active sessions', async () => {
    const { repo, prisma } = makeRepo()

    await expect(repo.pendingDecisionsBySessions([])).resolves.toEqual([])

    expect(prisma.boardDecision.findMany).not.toHaveBeenCalled()
  })

  it('filters SEVERE only after selecting the latest row per series', async () => {
    const { repo, prisma } = makeRepo()
    const latestNotSevere = { id: 'a2', seriesId: 'series-a', riskLevel: $Enums.RiskLevel.NONE }
    const staleSevere = { id: 'a1', seriesId: 'series-a', riskLevel: $Enums.RiskLevel.SEVERE }
    const latestSevere = { id: 'b2', seriesId: 'series-b', riskLevel: $Enums.RiskLevel.SEVERE }
    prisma.rankingRecord.findMany.mockResolvedValue([latestNotSevere, staleSevere, latestSevere])

    await expect(repo.severeRiskRankings()).resolves.toEqual([latestSevere])
    expect(prisma.rankingRecord.findMany).toHaveBeenCalledWith({ orderBy: { recordedAt: 'desc' } })
    expect(prisma.rankingRecord.findMany.mock.calls[0][0]).not.toHaveProperty('where')
  })
})
