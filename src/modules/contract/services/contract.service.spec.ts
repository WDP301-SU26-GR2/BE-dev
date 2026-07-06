import { ContractService } from './contract.service'
import { ContractStatus } from '@prisma/client'
import { CreateContractBodyDto } from '../dto/contract.dto'

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

  it('approves when caller is the mangaka', async () => {
    const m = makeMocks()
    m.contractRepo.findById.mockResolvedValue({ id: 'c1', mangakaId: 'm1', editorId: 'e1' })
    m.contractRepo.updateStatus.mockResolvedValue({ id: 'c1', status: ContractStatus.MANGAKA_APPROVED })
    const res = await makeService(m).mangakaApprove('c1', 'm1')
    expect(m.contractRepo.updateStatus).toHaveBeenCalledWith('c1', ContractStatus.MANGAKA_APPROVED)
    expect(res).toMatchObject({ id: 'c1' })
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
      boardSignedAt: new Date() // board already signed → mangaka sign flips to FULLY_EXECUTED
    })
    m.contractRepo.updateStatus.mockResolvedValue({ id: 'c1', seriesId: 's1', status: ContractStatus.FULLY_EXECUTED })
    await makeService(m).signByMangakaWithOtp('c1', 'm1', 'm1@x.test', '123456')
    expect(m.domainEventBus.emit).toHaveBeenCalledWith('contract.executed', { contractId: 'c1', seriesId: 's1' })
  })
})
