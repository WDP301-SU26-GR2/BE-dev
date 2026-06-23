import { RegisterBodySchema, VerifyEmailBodySchema } from './auth-schemas'

const baseRegisterBody = {
  email: 'a@b.com',
  name: 'Alice',
  phoneNumber: '0123456789',
  displayName: 'Alice',
  password: 'Abcdef12',
  confirm_password: 'Abcdef12',
  type: 'MANGAKA'
}

describe('RegisterBodySchema', () => {
  it('accepts a strong password', () => {
    expect(RegisterBodySchema.safeParse(baseRegisterBody).success).toBe(true)
  })

  it('rejects password without uppercase', () => {
    expect(
      RegisterBodySchema.safeParse({
        ...baseRegisterBody,
        password: 'abcdef12',
        confirm_password: 'abcdef12'
      }).success
    ).toBe(false)
  })

  it('rejects password shorter than 8 characters', () => {
    expect(
      RegisterBodySchema.safeParse({ ...baseRegisterBody, password: 'Abc12', confirm_password: 'Abc12' }).success
    ).toBe(false)
  })

  it('rejects the old code field', () => {
    expect(RegisterBodySchema.safeParse({ ...baseRegisterBody, code: '123456' }).success).toBe(false)
  })
})

describe('VerifyEmailBodySchema', () => {
  it('accepts email and a 6-digit code', () => {
    expect(VerifyEmailBodySchema.safeParse({ email: 'a@b.com', code: '123456' }).success).toBe(true)
  })

  it('rejects a 5-digit code', () => {
    expect(VerifyEmailBodySchema.safeParse({ email: 'a@b.com', code: '12345' }).success).toBe(false)
  })
})
