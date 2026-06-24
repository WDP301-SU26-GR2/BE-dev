import { ReputationService } from './reputation.service'
import { AssistantReviewService } from './assistant-review.service'

function make() {
  const reviewsRepository = {
    upsertAssistantReview: jest.fn().mockResolvedValue({
      id: 'r1',
      rating: 5,
      comment: 'great',
      createdAt: new Date('2026-06-23T00:00:00.000Z')
    }),
    aggregateAssistantReviews: jest.fn().mockResolvedValue({ sum: 24, count: 5 }),
    listAssistantReviews: jest.fn().mockResolvedValue([
      {
        id: 'r1',
        mangakaId: 'm1',
        rating: 5,
        comment: 'great',
        createdAt: new Date('2026-06-23T00:00:00.000Z')
      }
    ]),
    findUserDisplayMap: jest.fn().mockResolvedValue(
      new Map([
        [
          'm1',
          {
            id: 'm1',
            displayName: 'Mangaka One',
            avatar: null
          }
        ]
      ])
    )
  }
  const assistantProfileService = {
    getByUserId: jest.fn().mockResolvedValue({ userId: 'a1' }),
    applyReputation: jest.fn().mockResolvedValue(undefined)
  }
  const notificationService = { notify: jest.fn().mockResolvedValue(undefined) }
  const service = new AssistantReviewService(
    reviewsRepository as never,
    new ReputationService(),
    assistantProfileService as never,
    notificationService as never
  )
  return { service, reviewsRepository, assistantProfileService, notificationService }
}

describe('AssistantReviewService.createOrUpdate', () => {
  const body = { assistantId: 'a1', rating: 5, comment: 'great' }

  it('upserts review, recomputes reputation, notifies, returns mapped review', async () => {
    const { service, reviewsRepository, assistantProfileService, notificationService } = make()
    const res = await service.createOrUpdate('m1', body)
    expect(reviewsRepository.upsertAssistantReview).toHaveBeenCalledWith({
      mangakaId: 'm1',
      assistantId: 'a1',
      rating: 5,
      comment: 'great',
      studioAssignmentId: null,
      seriesId: null
    })
    expect(assistantProfileService.applyReputation).toHaveBeenCalledWith('a1', {
      ratingAvg: 4.8,
      ratingCount: 5,
      reputationScore: 4.15,
      isRecommended: true
    })
    expect(notificationService.notify).toHaveBeenCalledWith({
      recipientId: 'a1',
      type: 'REVIEW',
      referenceId: 'r1',
      referenceType: 'ASSISTANT_REVIEW',
      content: null
    })
    expect(res).toEqual({ id: 'r1', rating: 5, comment: 'great', createdAt: '2026-06-23T00:00:00.000Z' })
  })

  it('throws when reviewer reviews self', async () => {
    const { service } = make()
    await expect(service.createOrUpdate('a1', { ...body, assistantId: 'a1' })).rejects.toBeDefined()
  })

  it('still returns review when notification fails (best-effort)', async () => {
    const { service, notificationService } = make()
    notificationService.notify.mockRejectedValueOnce(new Error('notify down'))
    const res = await service.createOrUpdate('m1', body)

    expect(res).toEqual({ id: 'r1', rating: 5, comment: 'great', createdAt: '2026-06-23T00:00:00.000Z' })
  })

  it('lists reviews with reviewer display only', async () => {
    const { service } = make()
    const res = await service.list('a1')

    expect(res).toEqual({
      items: [
        {
          id: 'r1',
          rating: 5,
          comment: 'great',
          createdAt: '2026-06-23T00:00:00.000Z',
          reviewer: { id: 'm1', displayName: 'Mangaka One', avatar: null }
        }
      ]
    })
  })
})
