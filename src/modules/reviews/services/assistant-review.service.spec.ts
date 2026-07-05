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
  const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
  const appConfigService = { get: jest.fn().mockResolvedValue({ reputationRecommendThreshold: 4.2 }) }
  const studioAssignmentService = {
    findEndedForPairById: jest
      .fn()
      .mockResolvedValue({ id: 'asg1', mangakaId: 'm1', assistantId: 'a1', status: 'TERMINATED' })
  }
  const service = new AssistantReviewService(
    reviewsRepository as never,
    new ReputationService(),
    assistantProfileService as never,
    notificationService as never,
    studioAssignmentService as never,
    appConfigService as never
  )
  return {
    service,
    reviewsRepository,
    assistantProfileService,
    notificationService,
    studioAssignmentService,
    appConfigService
  }
}

describe('AssistantReviewService.createOrUpdate', () => {
  const body = { assistantId: 'a1', rating: 5, comment: 'great', studioAssignmentId: 'asg1' }

  it('upserts review, recomputes reputation, notifies, returns mapped review', async () => {
    const { service, reviewsRepository, assistantProfileService, notificationService } = make()
    const res = await service.createOrUpdate('m1', body)
    expect(reviewsRepository.upsertAssistantReview).toHaveBeenCalledWith({
      mangakaId: 'm1',
      assistantId: 'a1',
      rating: 5,
      comment: 'great',
      studioAssignmentId: 'asg1',
      seriesId: null
    })
    expect(assistantProfileService.applyReputation).toHaveBeenCalledWith('a1', {
      ratingAvg: 4.8,
      ratingCount: 5,
      reputationScore: 4.15,
      isRecommended: false
    })
    expect(notificationService.notifySafe).toHaveBeenCalledWith({
      recipientId: 'a1',
      type: 'REVIEW',
      referenceId: 'r1',
      referenceType: 'ASSISTANT_REVIEW_RECEIVED',
      content: expect.any(String)
    })
    expect(res).toEqual({ id: 'r1', rating: 5, comment: 'great', createdAt: '2026-06-23T00:00:00.000Z' })
  })

  it('throws when reviewer reviews self', async () => {
    const { service } = make()
    await expect(service.createOrUpdate('a1', { ...body, assistantId: 'a1' })).rejects.toBeDefined()
  })

  it('throws when no ended assignment for the pair (gate)', async () => {
    const { service, studioAssignmentService } = make()
    studioAssignmentService.findEndedForPairById.mockResolvedValueOnce(null)
    await expect(service.createOrUpdate('m1', body)).rejects.toBeDefined()
  })

  it('uses best-effort notifySafe boundary and returns review', async () => {
    const { service, notificationService } = make()
    const res = await service.createOrUpdate('m1', body)

    expect(notificationService.notifySafe).toHaveBeenCalled()
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
