import { ConflictException, NotFoundException } from '@nestjs/common'
import { UsersMessages } from '../users.messages'

const E = UsersMessages.error

export const UserEmailExistsException = new ConflictException(E.emailAlreadyExists)

export const ProfileNotFoundException = new NotFoundException(E.profileNotFound)

export const UserNotFoundException = new NotFoundException(E.userNotFound)
