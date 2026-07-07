/* eslint-disable @typescript-eslint/unbound-method */
import { Test } from '@nestjs/testing'
import { ContractAmendmentListener } from './contract-amendment.listener'
import { ContractAmendmentRepo } from '../contract-amendment.repo'
import { NotificationService } from 'src/modules/notification/notification.service'

describe('ContractAmendmentListener', () => {
  let listener: ContractAmendmentListener
  let repo: jest.Mocked<ContractAmendmentRepo>
  let notif: jest.Mocked<NotificationService>

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [
        ContractAmendmentListener,
        {
          provide: ContractAmendmentRepo,
          useValue: {
            findExecutedContractBySeries: jest.fn(),
            findOpenByContract: jest.fn(),
            create: jest.fn()
          }
        },
        { provide: NotificationService, useValue: { notifySafe: jest.fn() } }
      ]
    }).compile()
    listener = mod.get(ContractAmendmentListener)
    repo = mod.get(ContractAmendmentRepo)
    notif = mod.get(NotificationService)
  })

  it('no executed contract → no-op (no throw)', async () => {
    repo.findExecutedContractBySeries.mockResolvedValue(null)
    await expect(
      listener.onAmendmentRequested({ seriesId: '64a000000000000000000001', trigger: 'FORMAT_CHANGE', summary: 's' })
    ).resolves.toBeUndefined()
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('open amendment exists → no-op', async () => {
    repo.findExecutedContractBySeries.mockResolvedValue({
      id: 'c1',
      editorId: 'e1',
      mangakaId: 'm1',
      contractType: 'REVENUE_SHARE'
    } as any)
    repo.findOpenByContract.mockResolvedValue({ id: 'open' } as any)
    await listener.onAmendmentRequested({ seriesId: 's', trigger: 'COMPLETION', summary: 's' })
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('creates DRAFT stub + notifies editor', async () => {
    repo.findExecutedContractBySeries.mockResolvedValue({
      id: 'c1',
      editorId: 'e1',
      mangakaId: 'm1',
      contractType: 'REVENUE_SHARE'
    } as any)
    repo.findOpenByContract.mockResolvedValue(null)
    repo.create.mockResolvedValue({ id: 'am1' } as any)
    await listener.onAmendmentRequested({ seriesId: 's', trigger: 'FORMAT_CHANGE', summary: 'fmt' })
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: 'c1', triggerSource: 'FORMAT_CHANGE', status: 'DRAFT' })
    )
    expect(notif.notifySafe).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 'e1', referenceType: 'CONTRACT_AMENDMENT_NEEDED' })
    )
  })
})
