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
  it('maps profiles to directory items (ISO dates, displayName/avatar/contact from user)', async () => {
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
        user: { displayName: 'Assistant One', avatar: null, email: 'asst1@x.com', phoneNumber: '+84911111111' }
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
      isRecommended: true,
      email: 'asst1@x.com',
      phoneNumber: '+84911111111'
    })
    expect(res.items[0].email).toBe('asst1@x.com')
    expect(res.items[0].phoneNumber).toBe('+84911111111')
  })

  it('returns empty list when no assistants', async () => {
    const { service, usersRepository } = make()
    usersRepository.findAssistantsForDirectory.mockResolvedValueOnce([])
    usersRepository.countAssistantsForDirectory.mockResolvedValueOnce(0)
    const res = await service.list({ limit: 20, offset: 0 })
    expect(res).toEqual({ items: [], total: 0, limit: 20, offset: 0 })
  })

  it('forwards the q search term to both the list and count queries (Spec 14 §3.1)', async () => {
    const { service, usersRepository } = make()
    usersRepository.findAssistantsForDirectory.mockResolvedValueOnce([])
    usersRepository.countAssistantsForDirectory.mockResolvedValueOnce(0)

    await service.list({ q: 'saku', limit: 20, offset: 0 })

    expect(usersRepository.findAssistantsForDirectory).toHaveBeenCalledWith(expect.objectContaining({ q: 'saku' }), {
      limit: 20,
      offset: 0
    })
    expect(usersRepository.countAssistantsForDirectory).toHaveBeenCalledWith(expect.objectContaining({ q: 'saku' }))
  })
})
