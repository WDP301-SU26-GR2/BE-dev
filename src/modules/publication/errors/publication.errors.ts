import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { PublicationMessages } from '../publication.messages'

const E = PublicationMessages.error

export const PublicationVersionNotFoundException = new NotFoundException(E.notFound)
export const SeriesNotFoundException = new NotFoundException(E.seriesNotFound)
export const SeriesAccessDeniedException = new ForbiddenException(E.accessDenied)
