import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { RevisionMessages } from '../revision.messages'

const E = RevisionMessages.error

export const RevisionRequestNotFoundException = new NotFoundException(E.revisionRequestNotFound)
export const NotRevisionRecipientException = new ForbiddenException(E.notRevisionRecipient)
