import { ForbiddenException, NotFoundException } from '@nestjs/common'

export const AnnotationNotFoundException = new NotFoundException('Error.AnnotationNotFound')
export const AnnotationForbiddenException = new ForbiddenException('Error.AnnotationForbidden')
