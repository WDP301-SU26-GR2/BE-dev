import { MangakaProfileGateAdapter } from './mangaka-profile-gate.adapter'
import { UsersRepository } from '../users.repo'

describe('MangakaProfileGateAdapter', () => {
  it('delegates hasProfile → usersRepository.mangakaProfileExists (true)', async () => {
    const mangakaProfileExists = jest.fn().mockResolvedValue(true)
    const adapter = new MangakaProfileGateAdapter({ mangakaProfileExists } as unknown as UsersRepository)
    await expect(adapter.hasProfile('u1')).resolves.toBe(true)
    expect(mangakaProfileExists).toHaveBeenCalledWith('u1')
  })

  it('delegates hasProfile → false when no profile', async () => {
    const mangakaProfileExists = jest.fn().mockResolvedValue(false)
    const adapter = new MangakaProfileGateAdapter({ mangakaProfileExists } as unknown as UsersRepository)
    await expect(adapter.hasProfile('u2')).resolves.toBe(false)
  })
})
