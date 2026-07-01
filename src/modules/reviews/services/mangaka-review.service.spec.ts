import { ReputationService } from './reputation.service'
import { MangakaReviewService } from './mangaka-review.service'

function make() {
  const reviewsRepository = {
    upsertMangakaReview: jest.fn().mockResolvedValue({
      id: 'r2',
      rating: 4,
      comment: null,
      createdAt: new Date('2026-06-23T00:00:00.000Z')
    }),
    aggregateMangakaReviews: jest.fn().mockResolvedValue({ sum: 4, count: 1 }),
    listMangakaReviews: jest.fn().mockResolvedValue([
      {
        id: 'r2',
        editorId: 'e1',
        rating: 4,
        comment: null,
        createdAt: new Date('2026-06-23T00:00:00.000Z')
      }
    ]),
    findUserDisplayMap: jest.fn().mockResolvedValue(
      new Map([
        [
          'e1',
          {
            id: 'e1',
            displayName: 'Editor One',
            avatar: null
          }
        ]
      ])
    )
  }
  const mangakaProfileService = {
    getByUserId: jest.fn().mockResolvedValue({ userId: 'm1' }),
    applyReputation: jest.fn().mockResolvedValue(undefined)
  }
  const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const service = new MangakaReviewService(
    reviewsRepository as never,
    new ReputationService(),
    mangakaProfileService as never,
    notificationService as never
  )
  return { service, reviewsRepository, mangakaProfileService, notificationService }
}

describe('MangakaReviewService.createOrUpdate', () => {
  it('upserts, recomputes (single review damped), notifies, returns mapped review', async () => {
    const { service, mangakaProfileService, notificationService } = make()
    const res = await service.createOrUpdate('e1', { mangakaId: 'm1', rating: 4 })
    expect(mangakaProfileService.applyReputation).toHaveBeenCalledWith('m1', {
      ratingAvg: 4,
      ratingCount: 1,
      reputationScore: 3.58, // (5*3.5+4)/(5+1)=21.5/6=3.5833->3.58
      isRecommended: false
    })
    expect(notificationService.notifySafe).toHaveBeenCalledWith({
      recipientId: 'm1',
      type: 'REVIEW',
      referenceId: 'r2',
      referenceType: 'MANGAKA_REVIEW_RECEIVED',
      content: expect.any(String)
    })
    expect(res).toEqual({ id: 'r2', rating: 4, comment: null, createdAt: '2026-06-23T00:00:00.000Z' })
  })

  it('uses best-effort notifySafe boundary and returns review', async () => {
    const { service, notificationService } = make()
    const res = await service.createOrUpdate('e1', { mangakaId: 'm1', rating: 4 })

    expect(notificationService.notifySafe).toHaveBeenCalled()
    expect(res).toEqual({ id: 'r2', rating: 4, comment: null, createdAt: '2026-06-23T00:00:00.000Z' })
  })

  it('lists reviews with reviewer display only', async () => {
    const { service } = make()
    const res = await service.list('m1')

    expect(res).toEqual({
      items: [
        {
          id: 'r2',
          rating: 4,
          comment: null,
          createdAt: '2026-06-23T00:00:00.000Z',
          reviewer: { id: 'e1', displayName: 'Editor One', avatar: null }
        }
      ]
    })
  })
})
