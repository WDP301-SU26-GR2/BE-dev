import { MangakaProfileService } from './mangaka-profile.service'
import { ProfileNotFoundException } from '../errors/users.errors'
import { UsersRepository } from '../users.repo'

const VALID_ID = 'a'.repeat(24)
const makeRepo = (over: Partial<UsersRepository> = {}): UsersRepository =>
  ({
    findMangakaProfileByUserId: jest.fn().mockResolvedValue(null),
    findUserBasicsWithRole: jest.fn().mockResolvedValue(null),
    ...over
  }) as UsersRepository

describe('MangakaProfileService.getByUserId', () => {
  it('có profile → hasProfile:true + data', async () => {
    const repo = makeRepo({
      findMangakaProfileByUserId: jest.fn().mockResolvedValue({
        userId: VALID_ID,
        penName: 'Aki',
        genres: ['ACTION'],
        experienceLevel: null,
        bio: null,
        portfolioFiles: [],
        reputationScore: 4,
        ratingAvg: 4,
        ratingCount: 2,
        isRecommended: true,
        user: { displayName: 'Aki-sensei', avatar: null }
      })
    })
    const svc = new MangakaProfileService(repo)
    const res = await svc.getByUserId(VALID_ID)
    expect(res.hasProfile).toBe(true)
    expect(res.penName).toBe('Aki')
    expect(res.displayName).toBe('Aki-sensei')
  })

  it('user là MANGAKA nhưng chưa profile → hasProfile:false + displayName', async () => {
    const repo = makeRepo({
      findUserBasicsWithRole: jest.fn().mockResolvedValue({
        id: VALID_ID,
        displayName: 'Newbie',
        avatar: 'k',
        role: { code: 'MANGAKA' }
      })
    })
    const svc = new MangakaProfileService(repo)
    const res = await svc.getByUserId(VALID_ID)
    expect(res.hasProfile).toBe(false)
    expect(res.penName).toBeNull()
    expect(res.genres).toEqual([])
    expect(res.displayName).toBe('Newbie')
  })

  it('user sai role (EDITOR) → ProfileNotFound', async () => {
    const repo = makeRepo({
      findUserBasicsWithRole: jest
        .fn()
        .mockResolvedValue({ id: VALID_ID, displayName: 'E', avatar: null, role: { code: 'EDITOR' } })
    })
    const svc = new MangakaProfileService(repo)
    await expect(svc.getByUserId(VALID_ID)).rejects.toBe(ProfileNotFoundException)
  })

  it('user không tồn tại → ProfileNotFound', async () => {
    const svc = new MangakaProfileService(makeRepo())
    await expect(svc.getByUserId(VALID_ID)).rejects.toBe(ProfileNotFoundException)
  })

  it('id rác (không 24-hex) → ProfileNotFound, không query', async () => {
    const repo = makeRepo()
    const svc = new MangakaProfileService(repo)
    await expect(svc.getByUserId('garbage')).rejects.toBe(ProfileNotFoundException)
    expect(repo['findMangakaProfileByUserId']).not.toHaveBeenCalled()
  })
})
