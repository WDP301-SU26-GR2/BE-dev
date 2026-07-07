import { ContractService } from './contract.service'
import { ContractStatus } from '@prisma/client'
import { CreateContractBodyDto } from '../dto/contract.dto'
import { RoleName } from 'src/core/security/constants/role.constant'

type Mocks = {
  contractRepo: any
  authOtpService: any
  notificationService: any
  domainEventBus: any
}

function makeMocks(): Mocks {
  return {
    contractRepo: {
      findById: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue({ id: 'c1' }),
      createDraft: jest.fn().mockResolvedValue({ id: 'c1' }),
      findSeriesStatus: jest.fn(),
      updateAndLogVersion: jest.fn()
    },
    authOtpService: { validateOtpCode: jest.fn().mockResolvedValue(undefined) },
    notificationService: { notifySafe: jest.fn().mockResolvedValue(undefined) },
    domainEventBus: { emit: jest.fn() }
  }
}

function makeService(m: Mocks) {
  return new ContractService(
    m.contractRepo as never,
    m.authOtpService as never,
    m.notificationService as never,
    m.domainEventBus as never
  )
}

describe('ContractService.mangakaApprove (B-CON-02 auth)', () => {
  it('403 when caller is not the contract mangaka', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({ id: 'c1', mangakaId: 'm1', editorId: 'e1' })
    await expect(makeService(m).mangakaApprove('c1', 'other')).rejects.toMatchObject({ status: 403 })
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
  it('emits ContractExecuted {contractId, seriesId} on FULLY_EXECUTED', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({
      id: 'c1',
      mangakaId: 'm1',
      mangakaSignedAt: null,
      boardSignedAt: new Date(), // board already signed → mangaka sign flips to FULLY_EXECUTED
      status: ContractStatus.BOARD_APPROVED // B-CON-02: signable only after board approves terms
    })
    m.contractRepo.updateStatus.mockResolvedValue({ id: 'c1', seriesId: 's1', status: ContractStatus.FULLY_EXECUTED })
    await makeService(m).signByMangakaWithOtp('c1', 'm1', 'm1@x.test', '123456')
    expect(m.domainEventBus.emit).toHaveBeenCalledWith('contract.executed', { contractId: 'c1', seriesId: 's1' })
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
