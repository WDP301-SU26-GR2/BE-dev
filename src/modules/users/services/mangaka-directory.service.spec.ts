import { MangakaDirectoryService } from './mangaka-directory.service'

describe('MangakaDirectoryService', () => {
  const row = {
    userId: '507f1f77bcf86cd799439011',
    penName: 'Saku',
    genres: ['ACTION'],
    experienceLevel: 'SENIOR',
    bio: 'hi',
    portfolioFiles: ['k1'],
    reputationScore: 4.2,
    ratingAvg: 4.5,
    ratingCount: 3,
    isRecommended: true,
    user: { displayName: 'Saku-sensei', avatar: 'a.png' }
  }

  it('maps rows to directory items without exposing email or phone', async () => {
    const repo = {
      findMangakasForDirectory: jest.fn().mockResolvedValue([row]),
      countMangakasForDirectory: jest.fn().mockResolvedValue(1)
    }
    const service = new MangakaDirectoryService(repo as never)

    const res = await service.list({ limit: 20, offset: 0 })

    expect(res).toEqual({
      items: [
        {
          userId: '507f1f77bcf86cd799439011',
          displayName: 'Saku-sensei',
          avatar: 'a.png',
          penName: 'Saku',
          genres: ['ACTION'],
          experienceLevel: 'SENIOR',
          bio: 'hi',
          portfolioFiles: ['k1'],
          reputationScore: 4.2,
          ratingAvg: 4.5,
          ratingCount: 3,
          isRecommended: true
        }
      ],
      total: 1,
      limit: 20,
      offset: 0
    })
    expect(JSON.stringify(res.items[0])).not.toContain('email')
    expect(JSON.stringify(res.items[0])).not.toContain('phoneNumber')
  })

  it('forwards q/genre/level to both list and count queries', async () => {
    const repo = {
      findMangakasForDirectory: jest.fn().mockResolvedValue([]),
      countMangakasForDirectory: jest.fn().mockResolvedValue(0)
    }
    const service = new MangakaDirectoryService(repo as never)

    await service.list({ q: 'sa', genre: 'ACTION', level: 'SENIOR', limit: 10, offset: 5 })

    const expected = { q: 'sa', genre: 'ACTION', level: 'SENIOR' }
    expect(repo.findMangakasForDirectory).toHaveBeenCalledWith(expected, { limit: 10, offset: 5 })
    expect(repo.countMangakasForDirectory).toHaveBeenCalledWith(expected)
  })
})
