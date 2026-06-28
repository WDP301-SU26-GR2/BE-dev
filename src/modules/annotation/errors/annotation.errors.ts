import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { AnnotationMessages } from '../annotation.messages'

const E = AnnotationMessages.error

export const AnnotationNotFoundException = new NotFoundException(E.annotationNotFound)
export const AnnotationForbiddenException = new ForbiddenException(E.annotationForbidden)
