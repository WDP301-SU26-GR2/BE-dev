import { ReprintRequestService } from './reprint-request.service'

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

    await service.editorApproveChapter('r1', { originalChapterId: 'ch1', approve: true } as any)

    expect(repo.update).toHaveBeenCalledWith('r1', expect.objectContaining({ status: 'PUBLISHED' }))
  })
})
