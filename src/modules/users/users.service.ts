import { Injectable } from '@nestjs/common'
import { UsersRepository } from './users.repo'
import { UserNotFoundException } from './errors/users.errors'
import { UpdateProfileBodyType } from './schemas/users-schemas'

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async getUserById(id: string) {
    const user = await this.usersRepository.findUnique({ id })
    if (!user) {
      throw UserNotFoundException
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      displayName: user.displayName,
      phoneNumber: user.phoneNumber,
      status: user.status
    }
  }

  async getMyProfile(userId: string) {
    return await this.getUserById(userId)
  }

  async updateMyProfile(userId: string, body: UpdateProfileBodyType) {
    return await this.getUserById(userId)
  }
}
