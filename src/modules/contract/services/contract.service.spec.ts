jest.mock('src/infrastructure/pdf/pdf-render.service', () => ({
  PdfRenderService: class PdfRenderService {}
}))

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
  pdfRenderService: any
  objectStorageService: any
  storageRepository: any
}

function makeMocks(): Mocks {
  return {
    contractRepo: {
      findById: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue({ id: 'c1' }),
      createDraft: jest.fn().mockResolvedValue({ id: 'c1' }),
      findSeriesForContractCreation: jest.fn(),
      findBoardDecisionForContractCreation: jest.fn(),
      findBlockingContractForCreation: jest.fn(),
      updateAndLogVersion: jest.fn(),
      findVersionsByContractId: jest.fn(),
      findVersionById: jest.fn(),
      findByIdForPdf: jest.fn(),
      getContractSignaturesProgress: jest.fn(),
      findWithBoardDecision: jest.fn()
    },
    authOtpService: { validateOtpCode: jest.fn().mockResolvedValue(undefined) },
    notificationService: { notifySafe: jest.fn().mockResolvedValue(undefined) },
    domainEventBus: { emit: jest.fn() },
    auditService: { record: jest.fn().mockResolvedValue(undefined) },
    pdfRenderService: { renderContractPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-')) },
    objectStorageService: {
      headObjectExists: jest.fn().mockResolvedValue(false),
      putObject: jest.fn().mockResolvedValue(undefined),
      createPresignedDownload: jest
        .fn()
        .mockResolvedValue({ downloadUrl: 'https://r2/pdf', expiresAt: '2026-07-20T00:00:00.000Z' })
    },
    storageRepository: { createAsset: jest.fn().mockResolvedValue({ id: 'asset1' }) }
  }
}

function makeService(m: Mocks) {
  return new ContractService(
    m.contractRepo as never,
    m.authOtpService as never,
    m.notificationService as never,
    m.domainEventBus as never,
    m.auditService as never,
    m.pdfRenderService as never,
    m.objectStorageService as never,
    m.storageRepository as never
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
  const BOARD_1 = 'board-1'
  // Roster phiên họp = nguồn sự thật duy nhất cho quyền xem xét điều khoản (mirror bước ký).
  const withRoster = (contract: Record<string, unknown>, allowedEditorIds: string[] = [BOARD_1, 'board-2']) => ({
    ...contract,
    boardDecision: { boardSession: { allowedEditorIds } }
  })

  it('boardApprove: MANGAKA_APPROVED → BOARD_APPROVED', async () => {
    const m = makeMocks()
    m.contractRepo.findWithBoardDecision.mockResolvedValue(
      withRoster({ id: CID, mangakaId: 'm1', editorId: 'e1', status: ContractStatus.MANGAKA_APPROVED })
    )
    m.contractRepo.updateStatus.mockResolvedValue({ id: CID, status: ContractStatus.BOARD_APPROVED })
    await makeService(m).boardApprove(CID, BOARD_1)
    expect(m.contractRepo.updateStatus).toHaveBeenCalledWith(CID, ContractStatus.BOARD_APPROVED)
  })

  it('boardApprove: 409 when contract is still MANGAKA_REVIEW (not yet mangaka-approved)', async () => {
    const m = makeMocks()
    m.contractRepo.findWithBoardDecision.mockResolvedValue(
      withRoster({ id: CID, mangakaId: 'm1', status: ContractStatus.MANGAKA_REVIEW })
    )
    await expect(makeService(m).boardApprove(CID, BOARD_1)).rejects.toMatchObject({ status: 409 })
    expect(m.contractRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('boardApprove: 403 Error.NotAuthorizedInBoard when caller is a BOARD_MEMBER outside the session roster', async () => {
    const m = makeMocks()
    m.contractRepo.findWithBoardDecision.mockResolvedValue(
      withRoster({ id: CID, mangakaId: 'm1', status: ContractStatus.MANGAKA_APPROVED })
    )
    await expect(makeService(m).boardApprove(CID, 'outsider-board')).rejects.toMatchObject({ status: 403 })
    expect(m.contractRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('boardRequestChanges: 403 when caller is a BOARD_MEMBER outside the session roster', async () => {
    const m = makeMocks()
    m.contractRepo.findWithBoardDecision.mockResolvedValue(
      withRoster({ id: CID, mangakaId: 'm1', status: ContractStatus.MANGAKA_APPROVED })
    )
    await expect(makeService(m).boardRequestChanges(CID, 'outsider-board', 'Sửa tỉ lệ ăn chia')).rejects.toMatchObject({
      status: 403
    })
    expect(m.contractRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('boardApprove: authz đứng TRƯỚC transition — người ngoài roster nhận 403 chứ không phải 409 lộ trạng thái', async () => {
    const m = makeMocks()
    m.contractRepo.findWithBoardDecision.mockResolvedValue(
      withRoster({ id: CID, mangakaId: 'm1', status: ContractStatus.DRAFT })
    )
    await expect(makeService(m).boardApprove(CID, 'outsider-board')).rejects.toMatchObject({ status: 403 })
  })

  // B-CON-02: reason bắt buộc — phải chảy vào CẢ audit (bản ghi bền) lẫn notification (báo tức thời).
  it('boardRequestChanges: reason đi vào audit.reason và nội dung notification gửi Editor', async () => {
    const m = makeMocks()
    const REASON = 'Tỉ lệ ăn chia 30% quá cao so với mặt bằng tác giả mới'
    m.contractRepo.findWithBoardDecision.mockResolvedValue(
      withRoster({ id: CID, mangakaId: 'm1', editorId: 'e1', status: ContractStatus.MANGAKA_APPROVED })
    )
    m.contractRepo.updateStatus.mockResolvedValue({ id: CID, status: ContractStatus.NEGOTIATION })

    await makeService(m).boardRequestChanges(CID, BOARD_1, REASON)

    expect(m.auditService.record).toHaveBeenCalledWith(expect.objectContaining({ reason: REASON }))
    expect(m.notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'e1', content: expect.stringContaining(REASON) })
    )
  })

  it('mangakaRequestChanges: reason đi vào audit.reason và nội dung notification gửi Editor', async () => {
    const m = makeMocks()
    const REASON = 'Xin dời mốc thanh toán đầu từ chương 10 xuống chương 5'
    m.contractRepo.findById.mockResolvedValue({
      id: CID,
      mangakaId: 'm1',
      editorId: 'e1',
      status: ContractStatus.MANGAKA_REVIEW
    })
    m.contractRepo.updateStatus.mockResolvedValue({ id: CID, status: ContractStatus.NEGOTIATION })

    await makeService(m).mangakaRequestChanges(CID, 'm1', REASON)

    expect(m.auditService.record).toHaveBeenCalledWith(expect.objectContaining({ reason: REASON }))
    expect(m.notificationService.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'e1', content: expect.stringContaining(REASON) })
    )
  })

  it('boardApprove: 400 Error.ContractBoardDecisionMissing khi hợp đồng chưa gắn quyết định Hội đồng', async () => {
    const m = makeMocks()
    m.contractRepo.findWithBoardDecision.mockResolvedValue({
      id: CID,
      mangakaId: 'm1',
      status: ContractStatus.MANGAKA_APPROVED,
      boardDecision: null
    })
    await expect(makeService(m).boardApprove(CID, BOARD_1)).rejects.toMatchObject({ status: 400 })
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
    await makeService(m).mangakaRequestChanges(CID, 'm1', 'Xin nâng tỉ lệ ăn chia lên 35%')
    expect(m.contractRepo.updateStatus).toHaveBeenCalledWith(CID, ContractStatus.NEGOTIATION)
  })

  it('boardRequestChanges: MANGAKA_APPROVED → NEGOTIATION (resets signatures)', async () => {
    const m = makeMocks()
    m.contractRepo.findWithBoardDecision.mockResolvedValue(
      withRoster({ id: CID, mangakaId: 'm1', status: ContractStatus.MANGAKA_APPROVED })
    )
    m.contractRepo.updateStatus.mockResolvedValue({ id: CID, status: ContractStatus.NEGOTIATION })
    await makeService(m).boardRequestChanges(CID, BOARD_1, 'Điều khoản chấm dứt còn mơ hồ')
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
    await expect(makeService(m).mangakaRequestChanges(CID, 'other', 'Sửa điều khoản')).rejects.toMatchObject({
      status: 403
    })
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
    await expect(makeService(m).boardApprove(BAD, BOARD_1)).rejects.toMatchObject({ status: 404 })
    await expect(makeService(m).boardRequestChanges(BAD, BOARD_1, 'Sửa điều khoản')).rejects.toMatchObject({
      status: 404
    })
    await expect(makeService(m).mangakaRequestChanges(BAD, 'm1', 'Sửa điều khoản')).rejects.toMatchObject({
      status: 404
    })
    expect(m.contractRepo.findById).not.toHaveBeenCalled()
    expect(m.contractRepo.findWithBoardDecision).not.toHaveBeenCalled()
  })
})

describe('ContractService.createDraft (B-CON-01 gate)', () => {
  const dto = {
    seriesId: '507f1f77bcf86cd799439011',
    mangakaId: '507f1f77bcf86cd799439012',
    boardDecisionId: '507f1f77bcf86cd799439013'
  } as unknown as CreateContractBodyDto

  const eligibleSeries = { id: dto.seriesId, mangakaId: dto.mangakaId, status: 'SERIALIZED' }
  const eligibleDecision = {
    id: dto.boardDecisionId,
    targetSeriesId: dto.seriesId,
    decisionType: 'SERIALIZATION',
    result: 'APPROVED'
  }

  function allowCreation(m: Mocks) {
    m.contractRepo.findSeriesForContractCreation.mockResolvedValue(eligibleSeries)
    m.contractRepo.findBoardDecisionForContractCreation.mockResolvedValue(eligibleDecision)
    m.contractRepo.findBlockingContractForCreation.mockResolvedValue(null)
  }

  it('409 when series is not SERIALIZED', async () => {
    const m = makeMocks()
    allowCreation(m)
    m.contractRepo.findSeriesForContractCreation.mockResolvedValue({ ...eligibleSeries, status: 'PITCHED' })
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
    allowCreation(m)
    m.contractRepo.createDraft.mockResolvedValue({ id: 'c1' })
    const res = await makeService(m).createDraft('e1', dto)
    expect(m.contractRepo.createDraft).toHaveBeenCalledWith('e1', dto)
    expect(res).toMatchObject({ id: 'c1' })
  })

  it('404 when boardDecisionId is malformed or does not exist', async () => {
    const m = makeMocks()
    allowCreation(m)
    await expect(makeService(m).createDraft('e1', { ...dto, boardDecisionId: 'bad' })).rejects.toMatchObject({
      status: 404
    })
    expect(m.contractRepo.findBoardDecisionForContractCreation).not.toHaveBeenCalled()

    m.contractRepo.findBoardDecisionForContractCreation.mockResolvedValue(null)
    await expect(makeService(m).createDraft('e1', dto)).rejects.toMatchObject({
      status: 404,
      response: { message: [{ message: 'Error.BoardDecisionNotFound', path: 'boardDecisionId' }] }
    })
    expect(m.contractRepo.createDraft).not.toHaveBeenCalled()
  })

  it.each([
    ['belongs to another series', { ...eligibleDecision, targetSeriesId: '507f1f77bcf86cd799439099' }],
    ['has another decision type', { ...eligibleDecision, decisionType: 'CANCELLATION' }],
    ['is not approved', { ...eligibleDecision, result: 'PENDING' }]
  ])('409 when Board Decision %s', async (_case, decision) => {
    const m = makeMocks()
    allowCreation(m)
    m.contractRepo.findBoardDecisionForContractCreation.mockResolvedValue(decision)

    await expect(makeService(m).createDraft('e1', dto)).rejects.toMatchObject({
      status: 409,
      response: { message: [{ message: 'Error.InvalidSerializationDecision', path: 'boardDecisionId' }] }
    })
    expect(m.contractRepo.createDraft).not.toHaveBeenCalled()
  })

  it('409 when mangakaId is not the serialized series owner', async () => {
    const m = makeMocks()
    allowCreation(m)
    m.contractRepo.findSeriesForContractCreation.mockResolvedValue({ ...eligibleSeries, mangakaId: 'another-mangaka' })

    await expect(makeService(m).createDraft('e1', dto)).rejects.toMatchObject({
      status: 409,
      response: { message: [{ message: 'Error.ContractMangakaMismatch', path: 'mangakaId' }] }
    })
    expect(m.contractRepo.createDraft).not.toHaveBeenCalled()
  })

  it('409 when a non-terminal Contract already uses the same series or Board Decision', async () => {
    const m = makeMocks()
    allowCreation(m)
    m.contractRepo.findBlockingContractForCreation.mockResolvedValue({ id: 'existing-contract' })

    await expect(makeService(m).createDraft('e1', dto)).rejects.toMatchObject({
      status: 409,
      response: { message: [{ message: 'Error.OpenContractExists', path: 'seriesId' }] }
    })
    expect(m.contractRepo.createDraft).not.toHaveBeenCalled()
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
    // S-02: transition nay đi qua CAS trong transaction. `executedNow` là cờ DUY NHẤT
    // quyết định ai được emit — chỉ request thắng CAS mới bắn event.
    m.contractRepo.recordMangakaSignatureAndSettle = jest.fn().mockResolvedValue({
      signed: true,
      executedNow: true,
      contract: { id: CID, seriesId: 's1', status: ContractStatus.FULLY_EXECUTED }
    })
    await makeService(m).signByMangakaWithOtp(CID, 'm1', 'm1@x.test', '123456')
    expect(m.domainEventBus.emit).toHaveBeenCalledWith('contract.executed', { contractId: CID, seriesId: 's1' })
  })

  it('S-02: THUA race (CAS trả signed=false) → AlreadySigned, KHÔNG emit', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({
      id: CID,
      mangakaId: 'm1',
      mangakaSignedAt: null,
      boardSignedAt: new Date(),
      status: ContractStatus.BOARD_APPROVED
    })
    m.contractRepo.recordMangakaSignatureAndSettle = jest
      .fn()
      .mockResolvedValue({ signed: false, executedNow: false, contract: null })

    await expect(makeService(m).signByMangakaWithOtp(CID, 'm1', 'm1@x.test', '123456')).rejects.toBeDefined()
    expect(m.domainEventBus.emit).not.toHaveBeenCalled()
  })

  it('S-02: ký thành công nhưng CHƯA đủ hai phía (executedNow=false) → KHÔNG emit', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({
      id: CID,
      mangakaId: 'm1',
      mangakaSignedAt: null,
      boardSignedAt: null, // board chưa ký xong
      status: ContractStatus.BOARD_APPROVED
    })
    m.contractRepo.recordMangakaSignatureAndSettle = jest.fn().mockResolvedValue({
      signed: true,
      executedNow: false,
      contract: { id: CID, seriesId: 's1', status: ContractStatus.MANGAKA_SIGNED }
    })

    await makeService(m).signByMangakaWithOtp(CID, 'm1', 'm1@x.test', '123456')
    expect(m.domainEventBus.emit).not.toHaveBeenCalled()
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

    await makeService(m).mangakaRequestChanges(CID, '507f1f77bcf86cd799439012', 'Xin sửa mốc thanh toán')

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

  // Sau khi siết roster, danh tính người bấm đã biết → audit ghi ĐÚNG board member thay vì null (system).
  it('boardApprove: ghi AuditLog CONTRACT/TRANSITION với actorId = board member đã bấm', async () => {
    const m = makeMocks()
    const BOARD = '507f1f77bcf86cd799439021'
    m.contractRepo.findWithBoardDecision.mockResolvedValue({
      id: CID,
      mangakaId: '507f1f77bcf86cd799439012',
      editorId: '507f1f77bcf86cd799439013',
      status: ContractStatus.MANGAKA_APPROVED,
      boardDecision: { boardSession: { allowedEditorIds: [BOARD] } }
    })
    m.contractRepo.updateStatus.mockResolvedValue({ id: CID, status: ContractStatus.BOARD_APPROVED })

    await makeService(m).boardApprove(CID, BOARD)

    expect(m.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'CONTRACT',
        entityId: CID,
        action: 'TRANSITION',
        fromState: ContractStatus.MANGAKA_APPROVED,
        toState: ContractStatus.BOARD_APPROVED,
        actorId: BOARD
      })
    )
  })

  it('boardRequestChanges: ghi AuditLog CONTRACT/TRANSITION với actorId = board member đã bấm', async () => {
    const m = makeMocks()
    const BOARD = '507f1f77bcf86cd799439021'
    m.contractRepo.findWithBoardDecision.mockResolvedValue({
      id: CID,
      mangakaId: '507f1f77bcf86cd799439012',
      editorId: '507f1f77bcf86cd799439013',
      status: ContractStatus.MANGAKA_APPROVED,
      boardDecision: { boardSession: { allowedEditorIds: [BOARD] } }
    })
    m.contractRepo.updateStatus.mockResolvedValue({ id: CID, status: ContractStatus.NEGOTIATION })

    await makeService(m).boardRequestChanges(CID, BOARD, 'Xin sửa mốc thanh toán')

    expect(m.auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'CONTRACT',
        entityId: CID,
        action: 'TRANSITION',
        fromState: ContractStatus.MANGAKA_APPROVED,
        toState: ContractStatus.NEGOTIATION,
        actorId: BOARD
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

// ─────────────────────────────────────────────────────────────────────────────
// S-02 (BACKEND_AUDIT_2026-07-20) — ký Board phải nguyên tử.
//
// Bản cũ: `countBoardSignatures()` chạy NGOÀI transaction rồi `count + 1`. Hai lỗi thật:
//  1. Hai người ký giữa chừng đồng thời → cả hai đọc cùng số cũ → không ai đạt ngưỡng
//     → hợp đồng KẸT VĨNH VIỄN (đã ký nên bị BoardMemberAlreadySigned chặn ký lại)
//     → series không publish được chapter nào nữa (BR-CONTRACT-05).
//  2. Hai người ký cuối đồng thời → cả hai đạt ngưỡng → emit ContractExecuted 2 lần.
//
// Bản mới: repo đếm LẠI bên trong transaction sau khi ghi, và CAS quyết định ai chốt.
// Service chỉ được tin `boardCompletedNow` / `executedNow` do repo trả về.
// ─────────────────────────────────────────────────────────────────────────────
describe('ContractService.signByBoardWithOtp — S-02 atomic signing', () => {
  const CID = '507f1f77bcf86cd799439055'
  const B1 = 'board-1'

  const seedCtx = (m: Mocks, over: Record<string, unknown> = {}) => {
    m.contractRepo.findWithBoardDecision.mockResolvedValue({
      id: CID,
      seriesId: 's1',
      mangakaId: 'm1',
      editorId: 'e1',
      status: ContractStatus.BOARD_APPROVED,
      boardSignedAt: null,
      mangakaSignedAt: new Date(),
      boardDecision: { boardSession: { allowedEditorIds: [B1, 'board-2', 'board-3'] } },
      ...over
    })
    m.contractRepo.findSpecificSignature = jest.fn().mockResolvedValue(null)
  }

  it('chữ ký giữa chừng: KHÔNG chốt, KHÔNG emit, báo tiến độ theo số repo đếm', async () => {
    const m = makeMocks()
    seedCtx(m)
    m.contractRepo.recordBoardSignatureAndSettle = jest.fn().mockResolvedValue({
      signatureCount: 2,
      boardCompletedNow: false,
      executedNow: false,
      contract: { id: CID, seriesId: 's1', status: ContractStatus.BOARD_APPROVED }
    })

    const res = await makeService(m).signByBoardWithOtp(CID, B1, 'b1@x.test', '123456')

    expect(res.status).toBe('PENDING_MORE_SIGNATURES')
    expect(m.domainEventBus.emit).not.toHaveBeenCalled()
    // Số hiển thị phải lấy TỪ REPO (đếm trong transaction), không tự cộng ở service.
    expect(res.message).toContain('2')
  })

  it('người ký cuối THẮNG CAS → chốt + emit đúng một lần', async () => {
    const m = makeMocks()
    seedCtx(m)
    m.contractRepo.recordBoardSignatureAndSettle = jest.fn().mockResolvedValue({
      signatureCount: 3,
      boardCompletedNow: true,
      executedNow: true,
      contract: { id: CID, seriesId: 's1', status: ContractStatus.FULLY_EXECUTED }
    })

    const res = await makeService(m).signByBoardWithOtp(CID, B1, 'b1@x.test', '123456')

    expect(res.status).toBe('COMPLETED')
    expect(m.domainEventBus.emit).toHaveBeenCalledTimes(1)
    expect(m.domainEventBus.emit).toHaveBeenCalledWith('contract.executed', { contractId: CID, seriesId: 's1' })
  })

  it('🔴 người ký cuối THUA CAS (người khác vừa chốt) → KHÔNG emit lần hai', async () => {
    const m = makeMocks()
    seedCtx(m)
    // Đủ chữ ký, nhưng cờ boardSignedAt đã bị request song song lật trước.
    m.contractRepo.recordBoardSignatureAndSettle = jest.fn().mockResolvedValue({
      signatureCount: 3,
      boardCompletedNow: false,
      executedNow: false,
      contract: { id: CID, seriesId: 's1', status: ContractStatus.FULLY_EXECUTED }
    })

    await makeService(m).signByBoardWithOtp(CID, B1, 'b1@x.test', '123456')

    expect(m.domainEventBus.emit).not.toHaveBeenCalled()
    expect(m.auditService.record).not.toHaveBeenCalled()
  })

  it('service KHÔNG tự đếm chữ ký nữa (nguồn sự thật là repo trong transaction)', async () => {
    const m = makeMocks()
    seedCtx(m)
    m.contractRepo.countBoardSignatures = jest.fn()
    m.contractRepo.recordBoardSignatureAndSettle = jest.fn().mockResolvedValue({
      signatureCount: 1,
      boardCompletedNow: false,
      executedNow: false,
      contract: { id: CID, seriesId: 's1', status: ContractStatus.BOARD_APPROVED }
    })

    await makeService(m).signByBoardWithOtp(CID, B1, 'b1@x.test', '123456')

    expect(m.contractRepo.countBoardSignatures).not.toHaveBeenCalled()
  })
})
