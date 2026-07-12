import { StaffProfileService } from './staff-profile.service'
import { ProfileNotFoundException } from '../errors/users.errors'

const USER_ID = '012345678901234567890123'

function makeDeps() {
  return {
    repo: {
      upsertStaffProfile: jest.fn().mockResolvedValue({}),
      findStaffProfileByUserId: jest.fn().mockResolvedValue(null),
      findUserBasicsWithRole: jest.fn().mockResolvedValue(null)
    }
  }
}
const make = (d: any) => new StaffProfileService(d.repo)

describe('StaffProfileService', () => {
  it('returns the profile when it exists', async () => {
    const d = makeDeps()
    d.repo.findStaffProfileByUserId.mockResolvedValue({
      userId: USER_ID,
      specialtyGenres: ['ACTION'],
      demographics: ['SHONEN'],
      bio: 'hi',
      yearsOfExperience: 5,
      user: { displayName: 'Ed', avatar: null, role: { code: 'EDITOR' } }
    })
    const out = await make(d).getByUserId(USER_ID)
    expect(out).toMatchObject({ hasProfile: true, role: 'EDITOR', specialtyGenres: ['ACTION'], displayName: 'Ed' })
  })

  it('is graceful when the user is EDITOR/BOARD but has no profile yet', async () => {
    const d = makeDeps()
    d.repo.findUserBasicsWithRole.mockResolvedValue({
      id: USER_ID,
      displayName: 'Board Guy',
      avatar: null,
      role: { code: 'BOARD_MEMBER' }
    })
    const out = await make(d).getByUserId(USER_ID)
    expect(out).toMatchObject({
      hasProfile: false,
      role: 'BOARD_MEMBER',
      specialtyGenres: [],
      demographics: [],
      bio: null,
      displayName: 'Board Guy'
    })
  })

  it('throws 404 for a wrong-role user (e.g. MANGAKA)', async () => {
    const d = makeDeps()
    d.repo.findUserBasicsWithRole.mockResolvedValue({ id: USER_ID, role: { code: 'MANGAKA' } })
    await expect(make(d).getByUserId(USER_ID)).rejects.toBe(ProfileNotFoundException)
  })

  it('throws 404 for a malformed id without touching the repo (AGENTS §10)', async () => {
    const d = makeDeps()
    await expect(make(d).getByUserId('garbage')).rejects.toBe(ProfileNotFoundException)
    expect(d.repo.findStaffProfileByUserId).not.toHaveBeenCalled()
  })
})
