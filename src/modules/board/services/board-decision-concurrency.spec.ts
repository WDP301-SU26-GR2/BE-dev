import { DomainEvent } from 'src/core/events/domain-events'
import * as Errors from '../errors/board.errors'
import { BoardDecisionWorkflowService } from './board-decision-workflow.service'

/**
 * O-1 / O-2 (review W4, 2026-08-05) — hai cửa sổ đua ở luồng bỏ phiếu Hội đồng.
 *
 * O-1: `castVote` kiểm "đã bỏ phiếu chưa" bằng cách ĐỌC rồi mới GHI. Hai request của cùng một
 *      thành viên về đồng thời thì cả hai đều qua được bước đọc ⇒ hai phiếu cùng lọt vào `votes[]`,
 *      làm sai `totalVotes`/`approveCount` và có thể lật kết quả ở roster nhỏ.
 *      ⇒ Việc chèn phiếu phải là một lệnh ghi CÓ ĐIỀU KIỆN; repo trả về `null` khi thua cuộc đua.
 *
 * O-2: `recalculateDecisionResult` cũng đọc-rồi-ghi khi chốt terminal ⇒ hai phiếu cuối về đồng thời
 *      có thể cùng thấy trạng thái chưa terminal và cùng emit `BoardDecisionFinalized` (listener
 *      series chạy hai lượt). ⇒ Chỉ request nào GIÀNH được lệnh ghi có điều kiện mới được emit.
 */
describe('BoardDecisionWorkflowService — chống đua khi bỏ phiếu (O-1/O-2)', () => {
  const DECISION_ID = '012345678901234567890124'
  const SESSION_ID = '012345678901234567890123'

  type VoteFixture = { voterId?: string; voteValue?: string }

  function makeService(options: {
    preResult: string | null
    preVotes: VoteFixture[]
    pushedVotes: VoteFixture[] | null
    claimed?: number
    rosterSize?: number
  }) {
    const rosterSize = options.rosterSize ?? 3
    const decision = {
      id: DECISION_ID,
      boardSessionId: SESSION_ID,
      decisionType: 'SERIALIZATION',
      targetSeriesId: 'ser1',
      details: null,
      result: options.preResult,
      votes: options.preVotes
    }
    const boardRepo = {
      findDecisionById: jest.fn().mockResolvedValue(decision),
      findSessionById: jest.fn().mockResolvedValue({
        id: SESSION_ID,
        status: 'ACTIVE',
        phase: 'VOTING',
        allowedEditorIds: Array.from({ length: rosterSize }, (_, index) => `b${index + 1}`)
      }),
      getActiveConfig: jest.fn().mockResolvedValue({ approveMajorityRatio: 0.5 }),
      pushVoteIfNotVoted: jest
        .fn()
        .mockResolvedValue(options.pushedVotes === null ? null : { votes: options.pushedVotes }),
      updateDecisionCounters: jest
        .fn()
        .mockImplementation((_id: string, counters: object) => Promise.resolve({ id: DECISION_ID, ...counters })),
      finalizeDecisionCountersIfNotTerminal: jest.fn().mockResolvedValue(options.claimed ?? 1)
    }
    const eventBus = { emit: jest.fn() }
    const auditService = { record: jest.fn().mockResolvedValue(undefined) }
    const boardGateway = { broadcastVoteProgress: jest.fn() }
    const service = new BoardDecisionWorkflowService(
      boardRepo as never,
      boardGateway as never,
      { notifySafe: jest.fn() } as never,
      eventBus as never,
      auditService as never
    )
    return { service, boardRepo, eventBus, auditService, boardGateway }
  }

  // ---- O-1 --------------------------------------------------------------------------------

  it('O-1: thua cuộc đua chèn phiếu (repo trả null) → 409 VoterAlreadyVoted, KHÔNG tính lại kết quả', async () => {
    const { service, boardRepo, eventBus } = makeService({
      preResult: 'PENDING_QUORUM',
      preVotes: [{ voterId: 'b1', voteValue: 'APPROVE' }], // b3 CHƯA có ở bản đọc trước ⇒ qua được tiền kiểm
      pushedVotes: null // nhưng lệnh ghi có điều kiện không khớp document nào
    })

    await expect(service.castVote(DECISION_ID, 'b3', { voteValue: 'APPROVE' } as never)).rejects.toMatchObject(
      Errors.VoterAlreadyVotedException
    )

    expect(boardRepo.updateDecisionCounters).not.toHaveBeenCalled()
    expect(boardRepo.finalizeDecisionCountersIfNotTerminal).not.toHaveBeenCalled()
    expect(eventBus.emit).not.toHaveBeenCalled()
  })

  it('O-1: chèn phiếu phải đi qua lệnh ghi có điều kiện, kèm đúng voterId', async () => {
    const { service, boardRepo } = makeService({
      preResult: 'PENDING_QUORUM',
      preVotes: [{ voterId: 'b1', voteValue: 'APPROVE' }],
      pushedVotes: [
        { voterId: 'b1', voteValue: 'APPROVE' },
        { voterId: 'b3', voteValue: 'REJECT' }
      ]
    })

    await service.castVote(DECISION_ID, 'b3', { voteValue: 'REJECT' } as never)

    expect(boardRepo.pushVoteIfNotVoted).toHaveBeenCalledWith(
      DECISION_ID,
      expect.objectContaining({ voterId: 'b3', voteValue: 'REJECT' })
    )
  })

  // ---- O-2 --------------------------------------------------------------------------------

  it('O-2: giành được lệnh chốt (count=1) → emit BoardDecisionFinalized đúng 1 lần + ghi audit', async () => {
    const { service, boardRepo, eventBus, auditService } = makeService({
      preResult: 'PENDING_QUORUM',
      preVotes: [{ voterId: 'b1', voteValue: 'APPROVE' }],
      pushedVotes: [
        { voterId: 'b1', voteValue: 'APPROVE' },
        { voterId: 'b2', voteValue: 'APPROVE' }
      ],
      claimed: 1
    })

    await service.castVote(DECISION_ID, 'b2', { voteValue: 'APPROVE' } as never)

    expect(boardRepo.finalizeDecisionCountersIfNotTerminal).toHaveBeenCalledWith(
      DECISION_ID,
      expect.objectContaining({ result: 'APPROVED' })
    )
    expect(eventBus.emit).toHaveBeenCalledTimes(1)
    expect(eventBus.emit).toHaveBeenCalledWith(
      DomainEvent.BoardDecisionFinalized,
      expect.objectContaining({ decisionId: DECISION_ID, result: 'APPROVED' })
    )
    expect(auditService.record).toHaveBeenCalledTimes(1)
  })

  it('O-2: THUA lệnh chốt (count=0 — request khác đã chốt trước) → KHÔNG emit, KHÔNG audit', async () => {
    const { service, boardRepo, eventBus, auditService } = makeService({
      preResult: 'PENDING_QUORUM',
      preVotes: [{ voterId: 'b1', voteValue: 'APPROVE' }],
      pushedVotes: [
        { voterId: 'b1', voteValue: 'APPROVE' },
        { voterId: 'b2', voteValue: 'APPROVE' }
      ],
      claimed: 0
    })

    await service.castVote(DECISION_ID, 'b2', { voteValue: 'APPROVE' } as never)

    expect(boardRepo.finalizeDecisionCountersIfNotTerminal).toHaveBeenCalled()
    expect(eventBus.emit).not.toHaveBeenCalled()
    expect(auditService.record).not.toHaveBeenCalled()
  })

  it('O-2: kết quả CHƯA terminal vẫn dùng updateDecisionCounters thường, không emit', async () => {
    const { service, boardRepo, eventBus } = makeService({
      preResult: 'PENDING',
      preVotes: [{ voterId: 'b1', voteValue: 'APPROVE' }],
      pushedVotes: [
        { voterId: 'b1', voteValue: 'APPROVE' },
        { voterId: 'b2', voteValue: 'REJECT' }
      ],
      rosterSize: 5
    })

    await service.castVote(DECISION_ID, 'b2', { voteValue: 'REJECT' } as never)

    expect(boardRepo.updateDecisionCounters).toHaveBeenCalledWith(
      DECISION_ID,
      expect.objectContaining({ result: 'PENDING_QUORUM' })
    )
    expect(boardRepo.finalizeDecisionCountersIfNotTerminal).not.toHaveBeenCalled()
    expect(eventBus.emit).not.toHaveBeenCalled()
  })

  it('O-2: quyết định đã terminal từ trước → không chốt lại, không emit (giữ guard cũ)', async () => {
    const { service, boardRepo, eventBus } = makeService({
      preResult: 'APPROVED',
      preVotes: [
        { voterId: 'b1', voteValue: 'APPROVE' },
        { voterId: 'b2', voteValue: 'APPROVE' }
      ],
      pushedVotes: [
        { voterId: 'b1', voteValue: 'APPROVE' },
        { voterId: 'b2', voteValue: 'APPROVE' },
        { voterId: 'b3', voteValue: 'APPROVE' }
      ]
    })

    await expect(service.castVote(DECISION_ID, 'b3', { voteValue: 'APPROVE' } as never)).rejects.toBeDefined()
    expect(boardRepo.finalizeDecisionCountersIfNotTerminal).not.toHaveBeenCalled()
    expect(eventBus.emit).not.toHaveBeenCalled()
  })
})
