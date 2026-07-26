import 'reflect-metadata'
import { UsersService } from './users.service'

describe('UsersService boundary', () => {
  it('depends only on cohesive me/admin/profile/directory applications', () => {
    expect(Reflect.getMetadata('design:paramtypes', UsersService) as unknown[]).toHaveLength(4)
  })
})
