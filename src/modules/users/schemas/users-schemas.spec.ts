import {
  AdminCreateUserBodySchema,
  AdminUpdateUserStatusBodySchema,
  MangakaProfileBodySchema,
  UpdateMeBodySchema
} from './users-schemas'

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

describe('UpdateMeBodySchema', () => {
  it('accepts partial update', () => {
    expect(UpdateMeBodySchema.parse({ displayName: 'Kishi' })).toEqual({ displayName: 'Kishi' })
  })

  it("accepts '' as the clear sentinel for displayName/avatar", () => {
    const out = UpdateMeBodySchema.parse({ displayName: '', avatar: '' })
    expect(out.displayName).toBe('')
    expect(out.avatar).toBe('')
  })

  it('rejects email / role / status (strict)', () => {
    expect(() => UpdateMeBodySchema.parse({ email: 'a@b.com' })).toThrow()
    expect(() => UpdateMeBodySchema.parse({ role: 'SUPER_ADMIN' })).toThrow()
    expect(() => UpdateMeBodySchema.parse({ status: 'ACTIVE' })).toThrow()
  })

  it('rejects non-E.164 phone', () => {
    expect(() => UpdateMeBodySchema.parse({ phoneNumber: '0912345678' })).toThrow()
    expect(UpdateMeBodySchema.parse({ phoneNumber: '+84912345678' }).phoneNumber).toBe('+84912345678')
  })

  it('rejects name shorter than 2 chars (cannot clear a required field)', () => {
    expect(() => UpdateMeBodySchema.parse({ name: '' })).toThrow()
  })
})
