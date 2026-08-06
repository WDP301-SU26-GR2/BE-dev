import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { MagazineMessages } from '../magazine.messages'

const E = MagazineMessages.error

export const MagazineAlreadyExistsException = new ConflictException([
  { message: E.magazineAlreadyExists, path: 'name' }
])
export const MagazineNotFoundException = new NotFoundException(E.magazineNotFound)
export const MagazineInUseException = new ConflictException(E.magazineInUse)
export const PublicationTypeInUseException = new ConflictException([
  { message: E.publicationTypeInUse, path: 'publicationTypes' }
])
export const MagazineNotRegisteredException = new UnprocessableEntityException([
  { message: E.magazineNotRegistered, path: 'details.magazine' }
])
export const PublicationTypeNotSupportedException = new UnprocessableEntityException([
  { message: E.publicationTypeNotSupportedByMagazine, path: 'details.publicationType' }
])
