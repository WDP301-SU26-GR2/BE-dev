import { ConflictException, NotFoundException } from '@nestjs/common'

export const UserEmailExistsException = new ConflictException('Error.EmailAlreadyExists')

export const ProfileNotFoundException = new NotFoundException('Error.ProfileNotFound')
