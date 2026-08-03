import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { SeriesRequestMessages } from '../series-request.messages'

const E = SeriesRequestMessages.error

export const SeriesRequestNotFoundException = new NotFoundException(E.notFound)
export const SeriesRequestNotAllowedException = new ConflictException(E.notAllowed)
export const OpenSeriesRequestExistsException = new ConflictException(E.openExists)
export const InvalidSeriesRequestTransitionException = new ConflictException(E.invalidTransition)
export const SeriesRequestAccessDeniedException = new ForbiddenException(E.accessDenied)
