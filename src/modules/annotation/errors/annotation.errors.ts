import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { AnnotationMessages } from '../annotation.messages'

const E = AnnotationMessages.error

export const AnnotationNotFoundException = new NotFoundException(E.annotationNotFound)
export const AnnotationForbiddenException = new ForbiddenException(E.annotationForbidden)
export const AnnotationTargetNotFoundException = new UnprocessableEntityException([
  { message: E.targetNotFound, path: 'targetId' }
])
