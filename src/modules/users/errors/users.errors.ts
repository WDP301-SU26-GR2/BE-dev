import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { UsersMessages } from '../users.messages'
import { CommitmentSummary } from '../users.constant'

const E = UsersMessages.error

export const UserEmailExistsException = new ConflictException(E.emailAlreadyExists)

export const ProfileNotFoundException = new NotFoundException(E.profileNotFound)

export const UserNotFoundException = new NotFoundException(E.userNotFound)

export const CannotModifyAdminUserException = new UnprocessableEntityException([
  { message: E.cannotModifyAdminUser, path: 'id' }
])

export const UserAlreadyDeletedException = new ConflictException(E.userAlreadyDeleted)

export const UserNotDeletedException = new ConflictException(E.userNotDeleted)

export const UserHasActiveCommitmentsException = (commitments: CommitmentSummary) => {
  // Keep the factory contract available for callers carrying the computed summary.
  // The public error shape intentionally exposes only the stable Error.* code.
  void commitments
  return new ConflictException([{ message: E.userHasActiveCommitments, path: 'id' }])
}
