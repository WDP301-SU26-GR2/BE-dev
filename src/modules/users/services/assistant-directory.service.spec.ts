import { AssistantDirectoryService } from './assistant-directory.service'

function make() {
  const usersRepository = {
    findAssistantsForDirectory: jest.fn(),
    countAssistantsForDirectory: jest.fn()
  }
  const service = new AssistantDirectoryService(usersRepository as never)
  return { service, usersRepository }
}

describe('AssistantDirectoryService.list', () => {
  it('maps profiles to directory items (ISO dates, displayName/avatar from user) and hides email/phone', async () => {
    const { service, usersRepository } = make()
    usersRepository.findAssistantsForDirectory.mockResolvedValueOnce([
      {
        userId: 'a1',
        specializations: ['BACKGROUND'],
        experienceLevel: 'SENIOR',
        portfolioFiles: ['k1'],
        availabilityStatus: 'AVAILABLE',
        availabilityFrom: new Date('2026-01-01T00:00:00.000Z'),
        availabilityTo: new Date('2026-12-31T00:00:00.000Z'),
        reputationScore: 4.2,
        ratingAvg: 4.5,
        ratingCount: 8,
        isRecommended: true,
        user: { displayName: 'Assistant One', avatar: null }
      }
    ])
    usersRepository.countAssistantsForDirectory.mockResolvedValueOnce(1)

    const res = await service.list({ limit: 20, offset: 0 })
    expect(res.total).toBe(1)
    expect(res.items[0]).toEqual({
      userId: 'a1',
      displayName: 'Assistant One',
      avatar: null,
      specializations: ['BACKGROUND'],
      experienceLevel: 'SENIOR',
      portfolioFiles: ['k1'],
      availabilityStatus: 'AVAILABLE',
      availabilityFrom: '2026-01-01T00:00:00.000Z',
      availabilityTo: '2026-12-31T00:00:00.000Z',
      reputationScore: 4.2,
      ratingAvg: 4.5,
      ratingCount: 8,
      isRecommended: true
    })
    expect(JSON.stringify(res.items[0])).not.toContain('email')
  })

  it('returns empty list when no assistants', async () => {
    const { service, usersRepository } = make()
    usersRepository.findAssistantsForDirectory.mockResolvedValueOnce([])
    usersRepository.countAssistantsForDirectory.mockResolvedValueOnce(0)
    const res = await service.list({ limit: 20, offset: 0 })
    expect(res).toEqual({ items: [], total: 0, limit: 20, offset: 0 })
  })
})
