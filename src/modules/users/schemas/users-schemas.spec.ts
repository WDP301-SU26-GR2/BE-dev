import { MangakaProfileBodySchema } from './users-schemas'

describe('MangakaProfile genres enum', () => {
  it('chấp nhận genres enum hợp lệ', () => {
    const p = MangakaProfileBodySchema.parse({ penName: 'Aki', genres: ['ACTION', 'FANTASY'] })
    expect(p.genres).toEqual(['ACTION', 'FANTASY'])
  })

  it('reject genres không thuộc enum', () => {
    expect(() => MangakaProfileBodySchema.parse({ penName: 'Aki', genres: ['action'] })).toThrow()
  })
})
