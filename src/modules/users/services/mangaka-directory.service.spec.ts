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
    user: { displayName: 'Saku-sensei', avatar: 'a.png', email: 'saku@x.com', phoneNumber: '+84900000000' }
  }

  it('maps rows to directory items including contact (email/phone)', async () => {
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
          isRecommended: true,
          email: 'saku@x.com',
          phoneNumber: '+84900000000'
        }
      ],
      total: 1,
      limit: 20,
      offset: 0
    })
    expect(res.items[0].email).toBe('saku@x.com')
    expect(res.items[0].phoneNumber).toBe('+84900000000')
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
