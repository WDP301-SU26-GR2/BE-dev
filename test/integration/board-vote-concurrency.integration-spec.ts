import { $Enums, PrismaClient } from '@prisma/client'
import { ObjectId } from 'mongodb'
import { BoardRepository } from 'src/modules/board/board.repo'
import { buildSuiteDatabaseUrl, validateTestEnvironment } from '../flows/lib/environment-guard'

const validated = validateTestEnvironment(process.env)

/**
 * O-1 / O-2 (2026-08-05) — chứng minh trên **Mongo THẬT** rằng hai lệnh ghi có điều kiện mới thực sự
 * chặn được cuộc đua. Unit test mock Prisma **không bao giờ** chứng minh được điều này: ngữ nghĩa của
 * bộ lọc `votes: { none: ... }` (mảng composite) và `result: { notIn: [...] }` (enum nullable) chỉ lộ
 * ra khi chạy với query engine thật — đúng bài học §73 (`null` ≠ ABSENT chỉ lộ ở DB thật).
 *
 * Chạy trên một database phụ riêng biệt để không đụng dữ liệu của flowtest.
 */
describe('Board vote — lệnh ghi có điều kiện trên Mongo thật (O-1/O-2)', () => {
  const suiteUrl = buildSuiteDatabaseUrl(validated.databaseUrl, `board_vote_${process.pid}_${Date.now()}`)
  const prisma = new PrismaClient({ datasourceUrl: suiteUrl })
  const repo = new BoardRepository(prisma as never)

  let sessionId: string
  const creatorId = new ObjectId().toHexString()

  beforeAll(async () => {
    const session = await prisma.boardSession.create({
      data: {
        title: 'phiên kiểm tra đua phiếu',
        creatorId,
        status: $Enums.BoardSessionStatus.ACTIVE,
        phase: $Enums.BoardSessionPhase.VOTING,
        allowedEditorIds: ['b1', 'b2', 'b3'].map(() => new ObjectId().toHexString()),
        startTime: new Date()
      }
    })
    sessionId = session.id
  })

  afterAll(async () => {
    await prisma.$runCommandRaw({ dropDatabase: 1 }).catch(() => undefined)
    await prisma.$disconnect()
  })

  async function makeDecision(result: $Enums.BoardDecisionResult | null) {
    const decision = await prisma.boardDecision.create({
      data: {
        boardSessionId: sessionId,
        decisionType: $Enums.DecisionType.SERIALIZATION,
        result,
        votes: []
      }
    })
    return decision.id
  }

  const voteFor = (voterId: string) => ({
    voterId,
    voteValue: $Enums.VoteValue.APPROVE,
    note: null,
    votedAt: new Date()
  })

  it('O-1: cùng một voter gọi hai lần → lần hai bị từ chối, chỉ còn ĐÚNG 1 phiếu', async () => {
    const decisionId = await makeDecision($Enums.BoardDecisionResult.PENDING)
    const voterId = new ObjectId().toHexString()

    const first = await repo.pushVoteIfNotVoted(decisionId, voteFor(voterId))
    const second = await repo.pushVoteIfNotVoted(decisionId, voteFor(voterId))

    expect(first).not.toBeNull()
    expect(second).toBeNull()

    const stored = await prisma.boardDecision.findUnique({ where: { id: decisionId } })
    expect(stored?.votes).toHaveLength(1)
  })

  it('O-1: 8 request ĐỒNG THỜI của cùng một voter → đúng 1 thắng, votes[] không nhân bản', async () => {
    const decisionId = await makeDecision($Enums.BoardDecisionResult.PENDING)
    const voterId = new ObjectId().toHexString()

    const results = await Promise.all(
      Array.from({ length: 8 }, () => repo.pushVoteIfNotVoted(decisionId, voteFor(voterId)))
    )

    expect(results.filter((row) => row !== null)).toHaveLength(1)
    const stored = await prisma.boardDecision.findUnique({ where: { id: decisionId } })
    expect(stored?.votes).toHaveLength(1)
  })

  it('O-1: voter KHÁC vẫn bỏ phiếu được (bộ lọc không chặn nhầm)', async () => {
    const decisionId = await makeDecision($Enums.BoardDecisionResult.PENDING)

    await repo.pushVoteIfNotVoted(decisionId, voteFor(new ObjectId().toHexString()))
    await repo.pushVoteIfNotVoted(decisionId, voteFor(new ObjectId().toHexString()))

    const stored = await prisma.boardDecision.findUnique({ where: { id: decisionId } })
    expect(stored?.votes).toHaveLength(2)
  })

  it('O-2: chốt lần đầu thắng (count=1), chốt lại trên quyết định đã terminal thì thua (count=0)', async () => {
    const decisionId = await makeDecision($Enums.BoardDecisionResult.PENDING_QUORUM)

    const firstClaim = await repo.finalizeDecisionCountersIfNotTerminal(decisionId, {
      result: $Enums.BoardDecisionResult.APPROVED,
      approveCount: 2,
      rejectCount: 0,
      totalVotes: 2,
      quorumMet: true,
      decidedAt: new Date()
    })
    const secondClaim = await repo.finalizeDecisionCountersIfNotTerminal(decisionId, {
      result: $Enums.BoardDecisionResult.REJECTED,
      approveCount: 0,
      rejectCount: 3,
      totalVotes: 3,
      quorumMet: true,
      decidedAt: new Date()
    })

    expect(firstClaim).toBe(1)
    expect(secondClaim).toBe(0)

    // Bên thua KHÔNG được ghi đè kết quả của bên thắng.
    const stored = await prisma.boardDecision.findUnique({ where: { id: decisionId } })
    expect(stored?.result).toBe($Enums.BoardDecisionResult.APPROVED)
    expect(stored?.approveCount).toBe(2)
  })

  it('O-2: 5 lần chốt ĐỒNG THỜI → đúng 1 lần thắng (nguồn của việc emit đúng 1 lần)', async () => {
    const decisionId = await makeDecision($Enums.BoardDecisionResult.PENDING_QUORUM)

    const claims = await Promise.all(
      Array.from({ length: 5 }, () =>
        repo.finalizeDecisionCountersIfNotTerminal(decisionId, {
          result: $Enums.BoardDecisionResult.APPROVED,
          approveCount: 2,
          rejectCount: 0,
          totalVotes: 2,
          quorumMet: true,
          decidedAt: new Date()
        })
      )
    )

    expect(claims.filter((count) => count > 0)).toHaveLength(1)
  })

  it('O-2: quyết định có result NULL vẫn chốt được ($nin khớp cả field null/absent)', async () => {
    const decisionId = await makeDecision(null)

    const claimed = await repo.finalizeDecisionCountersIfNotTerminal(decisionId, {
      result: $Enums.BoardDecisionResult.APPROVED,
      approveCount: 2,
      rejectCount: 0,
      totalVotes: 2,
      quorumMet: true,
      decidedAt: new Date()
    })

    expect(claimed).toBe(1)
  })
})
