import { ReprintRequestService } from './reprint-request.service'
import { RoleName } from 'src/core/security/constants/role.constant'

describe('ReprintRequestService', () => {
  it('publishes the request when all chapters are approved', async () => {
    const repo = {
      findActiveContractBySeriesId: jest
        .fn()
        .mockResolvedValue({ id: 'c1', contractType: 'FULL_BUYOUT', mangakaId: 'm1' }),
      findById: jest.fn().mockResolvedValue({
        id: 'r1',
        seriesId: 's1',
        requestedBy: 'u1',
        status: 'BOARD_APPROVED',
        chapters: [{ originalChapterId: 'ch1', status: 'PUBLISHED' }]
      }),
      update: jest.fn().mockResolvedValue({ id: 'r1', status: 'PUBLISHED' })
    }
    const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const service = new ReprintRequestService(repo as never, notificationService as never)

    await service.editorApproveChapter('r1', { originalChapterId: 'ch1', approve: true })

    expect(repo.update).toHaveBeenCalledWith('r1', expect.objectContaining({ status: 'PUBLISHED' }))
  })
})

describe('ReprintRequestService.findAll scoping', () => {
  const repo = { findManyScoped: jest.fn().mockResolvedValue([]) } as any
  const notificationService = { notifySafe: jest.fn() } as any
  const service = new ReprintRequestService(repo as never, notificationService as never)

  it('BOARD_MEMBER → all (passes roleName to repo)', async () => {
    await service.findAll('u1', RoleName.BOARD_MEMBER, {})
    expect(repo.findManyScoped).toHaveBeenCalledWith({
      userId: 'u1',
      roleName: RoleName.BOARD_MEMBER,
      status: undefined,
      seriesId: undefined
    })
  })
  it('MANGAKA → scoped (passes roleName to repo)', async () => {
    await service.findAll('m1', RoleName.MANGAKA, {})
    expect(repo.findManyScoped).toHaveBeenCalledWith({
      userId: 'm1',
      roleName: RoleName.MANGAKA,
      status: undefined,
      seriesId: undefined
    })
  })
})
