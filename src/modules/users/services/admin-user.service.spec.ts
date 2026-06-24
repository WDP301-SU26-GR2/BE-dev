import { AdminUserService } from './admin-user.service'

function makeService() {
  const usersRepository = {
    getRoleIdByCode: jest.fn().mockResolvedValue('role1'),
    createAdminUser: jest.fn().mockResolvedValue({ id: 'u1', email: 'e@x.com' })
  }
  const hashingService = { hash: jest.fn().mockResolvedValue('hashed') }
  const emailService = { sendAccountCredentials: jest.fn().mockResolvedValue(undefined) }
  const service = new AdminUserService(usersRepository as never, hashingService as never, emailService as never)
  return { service, usersRepository, hashingService, emailService }
}

describe('AdminUserService.createUser', () => {
  const body = {
    email: 'e@x.com',
    name: 'Editor A',
    phoneNumber: '0123456789',
    roleCode: 'EDITOR' as const
  }

  it('creates user and sends credential email', async () => {
    const { service, emailService } = makeService()
    const res = await service.createUser(body)

    expect(emailService.sendAccountCredentials).toHaveBeenCalledWith({
      email: 'e@x.com',
      name: 'Editor A',
      temporaryPassword: expect.any(String)
    })
    expect(res).toMatchObject({ id: 'u1', email: 'e@x.com', roleCode: 'EDITOR' })
    expect(res.temporaryPassword).toEqual(expect.any(String))
  })

  it('still returns user + temporaryPassword when email send fails (best-effort)', async () => {
    const { service, emailService } = makeService()
    emailService.sendAccountCredentials.mockRejectedValueOnce(new Error('resend down'))
    const res = await service.createUser(body)

    expect(res).toMatchObject({ id: 'u1', roleCode: 'EDITOR' })
    expect(res.temporaryPassword).toEqual(expect.any(String))
  })
})
