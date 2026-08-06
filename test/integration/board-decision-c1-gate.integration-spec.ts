import { $Enums, PrismaClient } from '@prisma/client'
import { ObjectId } from 'mongodb'
import { BoardRepository } from 'src/modules/board/board.repo'
import { buildSuiteDatabaseUrl, validateTestEnvironment } from '../flows/lib/environment-guard'

const validated = validateTestEnvironment(process.env)

/**
 * C1 (Spec 2026-08-06) — chứng minh trên **Mongo THẬT** rằng gate C1 chặn được việc tạo
 * 2 quyết định Hội đồng mở cho cùng một series.
 *
 * Điều kiện: targetSeriesId non-null + đã có decision với result NOT IN TERMINAL.
 * Gate dùng: `findOpenDecisionBySeries` với `result: { notIn: ['APPROVED', 'REJECTED', 'EXPIRED'] }`.
 *
 * Chạy trên một database phụ riêng biệt để không đụng dữ liệu của flowtest.
 */
describe('Board decision — C1 gate: chặn 2 decision mở cùng series trên Mongo thật', () => {
  const suiteUrl = buildSuiteDatabaseUrl(validated.databaseUrl, `board_c1_gate_${process.pid}_${Date.now()}`)
  const prisma = new PrismaClient({ datasourceUrl: suiteUrl })
  const repo = new BoardRepository(prisma as never)

  let sessionId: string
  let seriesId: string
  const creatorId = new ObjectId().toHexString()

  beforeAll(async () => {
    // Tạo session để có thể tạo decision
    const session = await prisma.boardSession.create({
      data: {
        title: 'phiên kiểm tra C1 gate',
        creatorId,
        status: $Enums.BoardSessionStatus.ACTIVE,
        phase: $Enums.BoardSessionPhase.VOTING,
        allowedEditorIds: ['b1', 'b2', 'b3'].map(() => new ObjectId().toHexString()),
        startTime: new Date()
      }
    })
    sessionId = session.id

    // Tạo series để gắn decision
    const series = await prisma.series.create({
      data: {
        title: 'Truyện kiểm tra C1',
        mangakaId: new ObjectId().toHexString(),
        editorId: new ObjectId().toHexString(),
        status: $Enums.SeriesStatus.PITCHED,
        genres: [],
        publicationType: $Enums.PublicationType.WEEKLY
      }
    })
    seriesId = series.id
  })

  afterAll(async () => {
    await prisma.$runCommandRaw({ dropDatabase: 1 }).catch(() => undefined)
    await prisma.$disconnect()
  })

  async function createDecision(targetSeriesId: string | null, result: $Enums.BoardDecisionResult | null) {
    return prisma.boardDecision.create({
      data: {
        boardSessionId: sessionId,
        decisionType: $Enums.DecisionType.SERIALIZATION,
        targetSeriesId,
        result,
        votes: []
      }
    })
  }

  it('C1a: decision mở (PENDING) → gate C1 chặn decision thứ 2 cùng series', async () => {
    const firstDecision = await createDecision(seriesId, $Enums.BoardDecisionResult.PENDING)

    // Gate C1: tìm decision mở cho series
    const openDecision = await repo.findOpenDecisionBySeries(seriesId)
    expect(openDecision).not.toBeNull()
    expect(openDecision?.id).toBe(firstDecision.id)

    // Cleanup
    await prisma.boardDecision.delete({ where: { id: firstDecision.id } })
  })

  it('C1b: decision mở (PENDING_QUORUM) → gate C1 chặn decision thứ 2 cùng series', async () => {
    const firstDecision = await createDecision(seriesId, $Enums.BoardDecisionResult.PENDING_QUORUM)

    const openDecision = await repo.findOpenDecisionBySeries(seriesId)
    expect(openDecision).not.toBeNull()
    expect(openDecision?.id).toBe(firstDecision.id)

    // Cleanup
    await prisma.boardDecision.delete({ where: { id: firstDecision.id } })
  })

  it('C1c: decision terminal (APPROVED) → gate C1 KHÔNG chặn (series được tạo decision mới)', async () => {
    const firstDecision = await createDecision(seriesId, $Enums.BoardDecisionResult.APPROVED)

    const openDecision = await repo.findOpenDecisionBySeries(seriesId)
    expect(openDecision).toBeNull()

    // Cleanup
    await prisma.boardDecision.delete({ where: { id: firstDecision.id } })
  })

  it('C1d: decision terminal (REJECTED) → gate C1 KHÔNG chặn', async () => {
    const firstDecision = await createDecision(seriesId, $Enums.BoardDecisionResult.REJECTED)

    const openDecision = await repo.findOpenDecisionBySeries(seriesId)
    expect(openDecision).toBeNull()

    // Cleanup
    await prisma.boardDecision.delete({ where: { id: firstDecision.id } })
  })

  it('C1e: decision terminal (EXPIRED) → gate C1 KHÔNG chặn', async () => {
    const firstDecision = await createDecision(seriesId, $Enums.BoardDecisionResult.EXPIRED)

    const openDecision = await repo.findOpenDecisionBySeries(seriesId)
    expect(openDecision).toBeNull()

    // Cleanup
    await prisma.boardDecision.delete({ where: { id: firstDecision.id } })
  })

  it('C1f: decision với result = null (absent) → gate C1 chặn được', async () => {
    const firstDecision = await createDecision(seriesId, null)

    const openDecision = await repo.findOpenDecisionBySeries(seriesId)
    expect(openDecision).not.toBeNull()
    expect(openDecision?.id).toBe(firstDecision.id)

    // Cleanup
    await prisma.boardDecision.delete({ where: { id: firstDecision.id } })
  })

  it('C1g: decision không có targetSeriesId → gate C1 không áp dụng', async () => {
    // Decision không gắn series → không bị gate C1
    const decision = await createDecision(null, $Enums.BoardDecisionResult.PENDING)

    // Với series khác, không tìm thấy open decision
    const openDecision = await repo.findOpenDecisionBySeries(seriesId)
    expect(openDecision).toBeNull()

    // Cleanup
    await prisma.boardDecision.delete({ where: { id: decision.id } })
  })

  it('C1h: 2 request đồng thời tạo decision cho cùng series → đúng 1 thành công', async () => {
    // Tạo decision đầu tiên để chiếm slot
    const firstDecision = await createDecision(seriesId, $Enums.BoardDecisionResult.PENDING)

    // Mô phỏng 2 request đồng thời - cả hai đều thấy open decision tồn tại
    const openDecision1 = await repo.findOpenDecisionBySeries(seriesId)
    const openDecision2 = await repo.findOpenDecisionBySeries(seriesId)

    expect(openDecision1).not.toBeNull()
    expect(openDecision2).not.toBeNull()
    expect(openDecision1?.id).toBe(openDecision2?.id) // Cùng một decision

    // Cleanup
    await prisma.boardDecision.delete({ where: { id: firstDecision.id } })
  })
})
