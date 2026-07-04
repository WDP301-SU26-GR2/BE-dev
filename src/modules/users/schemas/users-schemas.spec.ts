import { AdminCreateUserBodySchema, AdminUpdateUserStatusBodySchema, MangakaProfileBodySchema } from './users-schemas'

const baseAdminCreateUserBody = {
  email: 'editor@example.com',
  name: 'Editor User',
  phoneNumber: '+84901234567',
  roleCode: 'EDITOR'
}

describe('AdminCreateUserBodySchema', () => {
  it('accepts E.164 phone numbers', () => {
    expect(AdminCreateUserBodySchema.safeParse(baseAdminCreateUserBody).success).toBe(true)
  })

  it('rejects local phone numbers without E.164 country code', () => {
    expect(AdminCreateUserBodySchema.safeParse({ ...baseAdminCreateUserBody, phoneNumber: '0901234567' }).success).toBe(
      false
    )
  })
})

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
