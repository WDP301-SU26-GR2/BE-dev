import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { DeadlineMessages } from '../deadline.messages'

const E = DeadlineMessages.error

export const DeadlineRequestNotFoundException = new NotFoundException(E.notFound)
export const DeadlineRequestAccessDeniedException = new ForbiddenException(E.accessDenied)
export const NotCounterpartyException = new ForbiddenException(E.notCounterparty)
export const OpenDeadlineRequestExistsException = new ConflictException(E.openExists)
export const DeadlineRequestNotAllowedException = new ConflictException(E.notAllowed)
export const InvalidDeadlineRequestTransitionException = new ConflictException(E.invalidTransition)
