import { AdminUpdateUserStatusBodySchema, MangakaProfileBodySchema } from './users-schemas'

describe('MangakaProfile genres enum', () => {
  it('chấp nhận genres enum hợp lệ', () => {
    const p = MangakaProfileBodySchema.parse({ penName: 'Aki', genres: ['ACTION', 'FANTASY'] })
    expect(p.genres).toEqual(['ACTION', 'FANTASY'])
  })

  it('reject genres không thuộc enum', () => {
    expect(() => MangakaProfileBodySchema.parse({ penName: 'Aki', genres: ['action'] })).toThrow()
  })
})

describe('AdminUpdateUserStatusBodySchema', () => {
  it('rejects INACTIVE for admin moderation status updates', () => {
    expect(() => AdminUpdateUserStatusBodySchema.parse({ status: 'INACTIVE' })).toThrow()
  })
})
