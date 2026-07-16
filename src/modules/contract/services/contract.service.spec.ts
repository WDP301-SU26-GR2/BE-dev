import { ContractService } from './contract.service'
import { ContractStatus } from '@prisma/client'
import { CreateContractBodyDto } from '../dto/contract.dto'
import { RoleName } from 'src/core/security/constants/role.constant'

type Mocks = {
  contractRepo: any
  authOtpService: any
  notificationService: any
  domainEventBus: any
  auditService: any
}

function makeMocks(): Mocks {
  return {
    contractRepo: {
      findById: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue({ id: 'c1' }),
      createDraft: jest.fn().mockResolvedValue({ id: 'c1' }),
      findSeriesStatus: jest.fn(),
      updateAndLogVersion: jest.fn(),
      findVersionsByContractId: jest.fn(),
      findVersionById: jest.fn(),
      getContractSignaturesProgress: jest.fn(),
      findWithBoardDecision: jest.fn()
    },
    authOtpService: { validateOtpCode: jest.fn().mockResolvedValue(undefined) },
    notificationService: { notifySafe: jest.fn().mockResolvedValue(undefined) },
    domainEventBus: { emit: jest.fn() },
    auditService: { record: jest.fn().mockResolvedValue(undefined) }
  }
}

function makeService(m: Mocks) {
  return new ContractService(
    m.contractRepo as never,
    m.authOtpService as never,
    m.notificationService as never,
    m.domainEventBus as never,
    m.auditService as never
  )
}

describe('ContractService.mangakaApprove (B-CON-02 auth)', () => {
  it('403 Error.NotContractMangaka when caller is not the contract mangaka (semantic-correct code)', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({ id: 'c1', mangakaId: 'm1', editorId: 'e1' })
    await expect(makeService(m).mangakaApprove('c1', 'other')).rejects.toMatchObject({
      status: 403,
      response: { message: [{ message: 'Error.NotContractMangaka', path: 'mangakaId' }] }
    })
    expect(m.contractRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('approves when caller is the mangaka (from MANGAKA_REVIEW)', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({
      id: 'c1',
      mangakaId: 'm1',
      editorId: 'e1',
      status: ContractStatus.MANGAKA_REVIEW
    })
    m.contractRepo.updateStatus.mockResolvedValue({ id: 'c1', status: ContractStatus.MANGAKA_APPROVED })
    const res = await makeService(m).mangakaApprove('c1', 'm1')
    expect(m.contractRepo.updateStatus).toHaveBeenCalledWith('c1', ContractStatus.MANGAKA_APPROVED)
    expect(res).toMatchObject({ id: 'c1' })
  })

  it('409 InvalidContractTransition when approving from a non-MANGAKA_REVIEW status', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({
      id: 'c1',
      mangakaId: 'm1',
      editorId: 'e1',
      status: ContractStatus.DRAFT
    })
    await expect(makeService(m).mangakaApprove('c1', 'm1')).rejects.toMatchObject({ status: 409 })
    expect(m.contractRepo.updateStatus).not.toHaveBeenCalled()
  })
})

describe('ContractService — B-CON-02 BOARD_REVIEW + request-changes', () => {
  const CID = '507f1f77bcf86cd799439099'
  it('boardApprove: MANGAKA_APPROVED → BOARD_APPROVED', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({
      id: CID,
      mangakaId: 'm1',
      editorId: 'e1',
      status: ContractStatus.MANGAKA_APPROVED
    })
    m.contractRepo.updateStatus.mockResolvedValue({ id: CID, status: ContractStatus.BOARD_APPROVED })
    await makeService(m).boardApprove(CID)
    expect(m.contractRepo.updateStatus).toHaveBeenCalledWith(CID, ContractStatus.BOARD_APPROVED)
  })

  it('boardApprove: 409 when contract is still MANGAKA_REVIEW (not yet mangaka-approved)', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({ id: CID, mangakaId: 'm1', status: ContractStatus.MANGAKA_REVIEW })
    await expect(makeService(m).boardApprove(CID)).rejects.toMatchObject({ status: 409 })
    expect(m.contractRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('mangakaRequestChanges: MANGAKA_REVIEW → NEGOTIATION (only the contract mangaka)', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({
      id: CID,
      mangakaId: 'm1',
      editorId: 'e1',
      status: ContractStatus.MANGAKA_REVIEW
    })
    m.contractRepo.updateStatus.mockResolvedValue({ id: CID, status: ContractStatus.NEGOTIATION })
    await makeService(m).mangakaRequestChanges(CID, 'm1')
    expect(m.contractRepo.updateStatus).toHaveBeenCalledWith(CID, ContractStatus.NEGOTIATION)
  })

  it('boardRequestChanges: MANGAKA_APPROVED → NEGOTIATION (resets signatures)', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({ id: CID, mangakaId: 'm1', status: ContractStatus.MANGAKA_APPROVED })
    m.contractRepo.updateStatus.mockResolvedValue({ id: CID, status: ContractStatus.NEGOTIATION })
    await makeService(m).boardRequestChanges(CID)
    expect(m.contractRepo.updateStatus).toHaveBeenCalledWith(CID, ContractStatus.NEGOTIATION, {
      mangakaSignedAt: null,
      boardSignedAt: null
    })
  })

  it('mangakaRequestChanges: 403 when caller is not the contract mangaka', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({
      id: CID,
      mangakaId: 'm1',
      editorId: 'e1',
      status: ContractStatus.MANGAKA_REVIEW
    })
    await expect(makeService(m).mangakaRequestChanges(CID, 'other')).rejects.toMatchObject({ status: 403 })
    expect(m.contractRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('signByMangaka: 409 NotSignableYet when contract is not BOARD_APPROVED', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({
      id: CID,
      mangakaId: 'm1',
      mangakaSignedAt: null,
      status: ContractStatus.MANGAKA_APPROVED
    })
    await expect(makeService(m).signByMangakaWithOtp(CID, 'm1', 'm1@x.test', '123456')).rejects.toMatchObject({
      status: 409
    })
    expect(m.contractRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('OBJECT_ID guard: throws NotFound on invalid ObjectId in boardApprove/boardRequestChanges/request-changes', async () => {
    const m = makeMocks()
    const BAD = 'not-an-objectid'
    await expect(makeService(m).boardApprove(BAD)).rejects.toMatchObject({ status: 404 })
    await expect(makeService(m).boardRequestChanges(BAD)).rejects.toMatchObject({ status: 404 })
    await expect(makeService(m).mangakaRequestChanges(BAD, 'm1')).rejects.toMatchObject({ status: 404 })
    expect(m.contractRepo.findById).not.toHaveBeenCalled()
  })
})

describe('ContractService.createDraft (B-CON-01 gate)', () => {
  const dto = { seriesId: '507f1f77bcf86cd799439011', mangakaId: 'm1' } as unknown as CreateContractBodyDto

  it('409 when series is not SERIALIZED', async () => {
    const m = makeMocks()
    m.contractRepo.findSeriesStatus.mockResolvedValue('PITCHED')
    await expect(makeService(m).createDraft('e1', dto)).rejects.toMatchObject({ status: 409 })
    expect(m.contractRepo.createDraft).not.toHaveBeenCalled()
  })

  it('404 when seriesId is malformed', async () => {
    const m = makeMocks()
    await expect(makeService(m).createDraft('e1', { ...dto, seriesId: 'bad' })).rejects.toBeDefined()
    expect(m.contractRepo.createDraft).not.toHaveBeenCalled()
  })

  it('creates draft when series is SERIALIZED', async () => {
    const m = makeMocks()
    m.contractRepo.findSeriesStatus.mockResolvedValue('SERIALIZED')
    m.contractRepo.createDraft.mockResolvedValue({ id: 'c1' })
    const res = await makeService(m).createDraft('e1', dto)
    expect(m.contractRepo.createDraft).toHaveBeenCalledWith('e1', dto)
    expect(res).toMatchObject({ id: 'c1' })
  })
})

describe('ContractService.signByMangakaWithOtp (ContractExecuted emit)', () => {
  const CID = '507f1f77bcf86cd799439044'
  it('emits ContractExecuted {contractId, seriesId} on FULLY_EXECUTED', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({
      id: CID,
      mangakaId: 'm1',
      mangakaSignedAt: null,
      boardSignedAt: new Date(), // board already signed → mangaka sign flips to FULLY_EXECUTED
      status: ContractStatus.BOARD_APPROVED // B-CON-02: signable only after board approves terms
    })
    m.contractRepo.updateStatus.mockResolvedValue({ id: CID, seriesId: 's1', status: ContractStatus.FULLY_EXECUTED })
    await makeService(m).signByMangakaWithOtp(CID, 'm1', 'm1@x.test', '123456')
    expect(m.domainEventBus.emit).toHaveBeenCalledWith('contract.executed', { contractId: CID, seriesId: 's1' })
  })
})

describe('ContractService.reportRevenue', () => {
  const base = {
    id: 'c1',
    editorId: 'ed1',
    mangakaId: 'm1',
    contractType: 'REVENUE_SHARE',
    status: 'FULLY_EXECUTED',
    seriesId: 's1'
  }

  it('emits RevenueReported for BOARD_MEMBER', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue(base)
    const res = await makeService(m).reportRevenue('507f1f77bcf86cd799439011', 'anyBoard', RoleName.BOARD_MEMBER, {
      revenue: 1000,
      period: '2026Q1'
    })
    expect(m.domainEventBus.emit).toHaveBeenCalledWith('contract.revenue_reported', {
      contractId: '507f1f77bcf86cd799439011',
      revenue: 1000,
      period: '2026Q1'
    })
    expect(res).toHaveProperty('message')
  })

  it('403 when EDITOR not the contract editor', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue(base)
    await expect(
      makeService(m).reportRevenue('507f1f77bcf86cd799439011', 'otherEd', RoleName.EDITOR, {
        revenue: 1,
        period: 'p'
      })
    ).rejects.toMatchObject({ status: 403 })
  })

  it('409 when not REVENUE_SHARE', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({ ...base, contractType: 'FULL_BUYOUT' })
    await expect(
      makeService(m).reportRevenue('507f1f77bcf86cd799439011', 'b', RoleName.BOARD_MEMBER, {
        revenue: 1,
        period: 'p'
      })
    ).rejects.toMatchObject({ status: 409 })
  })

  it('404 on malformed id', async () => {
    const m = makeMocks()
    await expect(
      makeService(m).reportRevenue('bad', 'b', RoleName.BOARD_MEMBER, { revenue: 1, period: 'p' })
    ).rejects.toMatchObject({ status: 404 })
  })
})

// Spec 11 — ObjectId guards on read-path routes. Mục tiêu: id rác phải 404 sạch,
// KHÔNG chạm tới repo (tránh Prisma P2023 -> 500).
describe('ContractService — Spec 11 ObjectId guards (read-path)', () => {
  const CID = '507f1f77bcf86cd799439099'
  const BAD = 'not-an-objectid'

  it('getContractById: id rác → 404, KHÔNG chạm repo', async () => {
    const m = makeMocks()
    await expect(makeService(m).getContractById(BAD, 'u1', RoleName.EDITOR)).rejects.toMatchObject({ status: 404 })
    expect(m.contractRepo.findById).not.toHaveBeenCalled()
  })

  it('getContractVersions: id rác → 404, KHÔNG chạm repo', async () => {
    const m = makeMocks()
    await expect(makeService(m).getContractVersions(BAD, 'u1', RoleName.EDITOR)).rejects.toMatchObject({ status: 404 })
    expect(m.contractRepo.findById).not.toHaveBeenCalled()
    expect(m.contractRepo.findVersionsByContractId).not.toHaveBeenCalled()
  })

  it('getContractVersionById: contractId rác → 404, KHÔNG chạm repo', async () => {
    const m = makeMocks()
    await expect(
      makeService(m).getContractVersionById(BAD, '507f1f77bcf86cd799439012', 'u1', RoleName.EDITOR)
    ).rejects.toMatchObject({ status: 404 })
    expect(m.contractRepo.findById).not.toHaveBeenCalled()
    expect(m.contractRepo.findVersionById).not.toHaveBeenCalled()
  })

  it('getContractVersionById: versionId rác → 404, KHÔNG chạm repo', async () => {
    const m = makeMocks()
    await expect(makeService(m).getContractVersionById(CID, BAD, 'u1', RoleName.EDITOR)).rejects.toMatchObject({
      status: 404
    })
    expect(m.contractRepo.findById).not.toHaveBeenCalled()
    expect(m.contractRepo.findVersionById).not.toHaveBeenCalled()
  })

  it('checkContractStatus: id rác → 404, KHÔNG chạm repo', async () => {
    const m = makeMocks()
    await expect(makeService(m).checkContractStatus(BAD, 'u1', RoleName.MANGAKA)).rejects.toMatchObject({
      status: 404
    })
    expect(m.contractRepo.getContractSignaturesProgress).not.toHaveBeenCalled()
  })

  it('editorUpdateContract: id rác → 404, KHÔNG chạm repo', async () => {
    const m = makeMocks()
    await expect(makeService(m).editorUpdateContract(BAD, 'e1', { mangakaOwnershipPct: 50 })).rejects.toMatchObject({
      status: 404
    })
    expect(m.contractRepo.findById).not.toHaveBeenCalled()
  })

  it('signByMangakaWithOtp: id rác → 404, KHÔNG chạm repo', async () => {
    const m = makeMocks()
    await expect(makeService(m).signByMangakaWithOtp(BAD, 'm1', 'm1@x.test', '123456')).rejects.toMatchObject({
      status: 404
    })
    expect(m.contractRepo.findById).not.toHaveBeenCalled()
  })

  it('signByBoardWithOtp: id rác → 404, KHÔNG chạm repo', async () => {
    const m = makeMocks()
    await expect(makeService(m).signByBoardWithOtp(BAD, 'b1', 'b1@x.test', '123456')).rejects.toMatchObject({
      status: 404
    })
    expect(m.contractRepo.findWithBoardDecision).not.toHaveBeenCalled()
  })
})

// Spec 11 — Audit trail for contract signing flow (AGENTS §8 / NFR §6 / BR-GEN-02)
describe('ContractService — Audit trail (Spec 11)', () => {
  const CID = '507f1f77bcf86cd799439011'

  it('mangakaApprove: ghi AuditLog CONTRACT/TRANSITION sau khi update', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({
      id: CID,
      mangakaId: '507f1f77bcf86cd799439012',
      editorId: '507f1f77bcf86cd799439013',
      status: ContractStatus.MANGAKA_REVIEW
    })
    m.contractRepo.updateStatus.mockResolvedValue({ id: CID, status: ContractStatus.MANGAKA_APPROVED })

    await makeService(m).mangakaApprove(CID, '507f1f77bcf86cd799439012')

    expect(m.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'CONTRACT',
        entityId: CID,
        action: 'TRANSITION',
        fromState: ContractStatus.MANGAKA_REVIEW,
        toState: ContractStatus.MANGAKA_APPROVED,
        actorId: '507f1f77bcf86cd799439012'
      })
    )
  })

  it('mangakaRequestChanges: ghi AuditLog CONTRACT/TRANSITION', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({
      id: CID,
      mangakaId: '507f1f77bcf86cd799439012',
      editorId: '507f1f77bcf86cd799439013',
      status: ContractStatus.MANGAKA_REVIEW
    })
    m.contractRepo.updateStatus.mockResolvedValue({ id: CID, status: ContractStatus.NEGOTIATION })

    await makeService(m).mangakaRequestChanges(CID, '507f1f77bcf86cd799439012')

    expect(m.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'CONTRACT',
        entityId: CID,
        action: 'TRANSITION',
        fromState: ContractStatus.MANGAKA_REVIEW,
        toState: ContractStatus.NEGOTIATION,
        actorId: '507f1f77bcf86cd799439012'
      })
    )
  })

  it('boardApprove: ghi AuditLog CONTRACT/TRANSITION (actorId = null)', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({
      id: CID,
      mangakaId: '507f1f77bcf86cd799439012',
      editorId: '507f1f77bcf86cd799439013',
      status: ContractStatus.MANGAKA_APPROVED
    })
    m.contractRepo.updateStatus.mockResolvedValue({ id: CID, status: ContractStatus.BOARD_APPROVED })

    await makeService(m).boardApprove(CID)

    expect(m.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'CONTRACT',
        entityId: CID,
        action: 'TRANSITION',
        fromState: ContractStatus.MANGAKA_APPROVED,
        toState: ContractStatus.BOARD_APPROVED,
        actorId: null
      })
    )
  })

  it('boardRequestChanges: ghi AuditLog CONTRACT/TRANSITION (actorId = null)', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({
      id: CID,
      mangakaId: '507f1f77bcf86cd799439012',
      editorId: '507f1f77bcf86cd799439013',
      status: ContractStatus.MANGAKA_APPROVED
    })
    m.contractRepo.updateStatus.mockResolvedValue({ id: CID, status: ContractStatus.NEGOTIATION })

    await makeService(m).boardRequestChanges(CID)

    expect(m.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'CONTRACT',
        entityId: CID,
        action: 'TRANSITION',
        fromState: ContractStatus.MANGAKA_APPROVED,
        toState: ContractStatus.NEGOTIATION,
        actorId: null
      })
    )
  })

  it('reportRevenue: ghi AuditLog REVENUE_REPORTED', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({
      id: CID,
      editorId: 'ed1',
      mangakaId: 'm1',
      contractType: 'REVENUE_SHARE',
      status: 'FULLY_EXECUTED'
    })

    await makeService(m).reportRevenue(CID, 'user1', RoleName.BOARD_MEMBER, {
      revenue: 1000,
      period: '2026Q1'
    })

    expect(m.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'CONTRACT',
        entityId: CID,
        action: 'REVENUE_REPORTED',
        actorId: 'user1'
      })
    )
    const call = m.auditService.record.mock.calls[0][0]
    expect(call.reason).toContain('revenue=1000')
    expect(call.reason).toContain('period=2026Q1')
  })

  it('audit lỗi → KHÔNG phá nghiệp vụ (best-effort)', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({
      id: CID,
      mangakaId: '507f1f77bcf86cd799439012',
      editorId: '507f1f77bcf86cd799439013',
      status: ContractStatus.MANGAKA_REVIEW
    })
    m.contractRepo.updateStatus.mockResolvedValue({ id: CID, status: ContractStatus.MANGAKA_APPROVED })
    m.auditService.record = jest.fn().mockRejectedValue(new Error('audit down'))

    // phải resolve (không throw) dù audit fail
    await expect(makeService(m).mangakaApprove(CID, '507f1f77bcf86cd799439012')).resolves.toBeDefined()
  })
})
