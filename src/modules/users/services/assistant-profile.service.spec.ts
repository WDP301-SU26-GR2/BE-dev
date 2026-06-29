import { AssistantProfileService } from './assistant-profile.service'
import { ProfileNotFoundException } from '../errors/users.errors'
import { UsersRepository } from '../users.repo'

const VALID_ID = 'b'.repeat(24)
const makeRepo = (over: Partial<UsersRepository> = {}): UsersRepository =>
  ({
    findAssistantProfileByUserId: jest.fn().mockResolvedValue(null),
    findUserBasicsWithRole: jest.fn().mockResolvedValue(null),
    ...over
  }) as UsersRepository

describe('AssistantProfileService.getByUserId', () => {
  it('có profile → hasProfile:true + ngày ISO', async () => {
    const repo = makeRepo({
      findAssistantProfileByUserId: jest.fn().mockResolvedValue({
        userId: VALID_ID,
        specializations: ['BACKGROUND'],
        experienceLevel: null,
        portfolioFiles: [],
        availabilityStatus: 'AVAILABLE',
        availabilityFrom: new Date('2026-06-29T00:00:00.000Z'),
        availabilityTo: null,
        reputationScore: 0,
        ratingAvg: 0,
        ratingCount: 0,
        isRecommended: false,
        user: { displayName: 'Bob', avatar: null }
      })
    })
    const svc = new AssistantProfileService(repo)
    const res = await svc.getByUserId(VALID_ID)
    expect(res.hasProfile).toBe(true)
    expect(res.availabilityFrom).toBe('2026-06-29T00:00:00.000Z')
  })

  it('user là ASSISTANT chưa profile → hasProfile:false', async () => {
    const repo = makeRepo({
      findUserBasicsWithRole: jest
        .fn()
        .mockResolvedValue({ id: VALID_ID, displayName: 'New', avatar: null, role: { code: 'ASSISTANT' } })
    })
    const svc = new AssistantProfileService(repo)
    const res = await svc.getByUserId(VALID_ID)
    expect(res.hasProfile).toBe(false)
    expect(res.specializations).toEqual([])
    expect(res.availabilityStatus).toBeNull()
    expect(res.displayName).toBe('New')
  })

  it('user sai role → ProfileNotFound', async () => {
    const repo = makeRepo({
      findUserBasicsWithRole: jest
        .fn()
        .mockResolvedValue({ id: VALID_ID, displayName: 'M', avatar: null, role: { code: 'MANGAKA' } })
    })
    const svc = new AssistantProfileService(repo)
    await expect(svc.getByUserId(VALID_ID)).rejects.toBe(ProfileNotFoundException)
  })

  it('id rác → ProfileNotFound, không query', async () => {
    const repo = makeRepo()
    const svc = new AssistantProfileService(repo)
    await expect(svc.getByUserId('garbage')).rejects.toBe(ProfileNotFoundException)
    expect(repo['findAssistantProfileByUserId']).not.toHaveBeenCalled()
  })
})
