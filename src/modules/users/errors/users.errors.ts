import { NotFoundException, UnprocessableEntityException } from '@nestjs/common'

export const UserNotFoundException = new NotFoundException('Error.UserNotFound')
export const InvalidPhoneNumberException = new UnprocessableEntityException([
  { message: 'Error.InvalidPhoneNumber', path: 'phoneNumber' }
])
