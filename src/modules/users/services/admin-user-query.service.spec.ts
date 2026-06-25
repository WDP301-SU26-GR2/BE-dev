import { AdminUserQueryService } from './admin-user-query.service'
import { UserNotFoundException } from '../errors/users.errors'

function makeService() {
  const usersRepository = {
    findUsersForAdmin: jest.fn(),
    countUsersForAdmin: jest.fn(),
    findUserByIdForAdmin: jest.fn()
  }
  const service = new AdminUserQueryService(usersRepository as never)
  return { service, usersRepository }
}

const row = {
  id: 'u2',
  email: 'a@b.com',
  name: 'A',
  displayName: 'AA',
  phoneNumber: '0900000000',
  avatar: null,
  status: 'ACTIVE',
  emailVerified: true,
  registrationType: 'SELF_REGISTERED',
  mustChangePassword: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  role: { code: 'MANGAKA' }
}

describe('AdminUserQueryService.list', () => {
  it('passes filter (excludeUserId=caller + query filters) and returns paginated mapped view', async () => {
    const { service, usersRepository } = makeService()
    usersRepository.findUsersForAdmin.mockResolvedValue([row])
    usersRepository.countUsersForAdmin.mockResolvedValue(1)

    const res = await service.list('caller1', {
      roleCode: 'MANGAKA',
      status: 'ACTIVE',
      search: 'a@b',
      limit: 20,
      offset: 0,
      includeDeleted: false
    } as never)

    const expectedFilter = {
      excludeUserId: 'caller1',
      roleCode: 'MANGAKA',
      status: 'ACTIVE',
      search: 'a@b',
      includeDeleted: false
    }
    expect(usersRepository.findUsersForAdmin).toHaveBeenCalledWith(expectedFilter, { limit: 20, offset: 0 })
    expect(usersRepository.countUsersForAdmin).toHaveBeenCalledWith(expectedFilter)
    expect(res).toEqual({
      items: [
        {
          id: 'u2',
          email: 'a@b.com',
          name: 'A',
          displayName: 'AA',
          phoneNumber: '0900000000',
          avatar: null,
          role: 'MANGAKA',
          status: 'ACTIVE',
          emailVerified: true,
          registrationType: 'SELF_REGISTERED',
          mustChangePassword: false,
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      total: 1,
      limit: 20,
      offset: 0
    })
    expect((res.items[0] as Record<string, unknown>).password).toBeUndefined()
  })
})

describe('AdminUserQueryService.getById', () => {
  it('returns mapped view when found', async () => {
    const { service, usersRepository } = makeService()
    usersRepository.findUserByIdForAdmin.mockResolvedValue(row)

    const res = await service.getById('507f1f77bcf86cd799439011')

    expect(usersRepository.findUserByIdForAdmin).toHaveBeenCalledWith('507f1f77bcf86cd799439011')
    expect(res).toMatchObject({ id: 'u2', role: 'MANGAKA', createdAt: '2026-01-01T00:00:00.000Z' })
  })

  it('throws UserNotFoundException when repo returns null', async () => {
    const { service, usersRepository } = makeService()
    usersRepository.findUserByIdForAdmin.mockResolvedValue(null)

    await expect(service.getById('507f1f77bcf86cd799439011')).rejects.toBe(UserNotFoundException)
  })

  it('throws UserNotFoundException for malformed id without hitting repo', async () => {
    const { service, usersRepository } = makeService()

    await expect(service.getById('not-an-objectid')).rejects.toBe(UserNotFoundException)
    expect(usersRepository.findUserByIdForAdmin).not.toHaveBeenCalled()
  })
})
