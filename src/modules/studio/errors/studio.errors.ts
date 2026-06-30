import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { StudioMessages } from '../studio.messages'

const E = StudioMessages.error

export const InviteNotFoundException = new NotFoundException([{ message: E.inviteNotFound, path: 'id' }])
export const InviteNotPendingException = new ConflictException([{ message: E.inviteNotPending, path: 'id' }])
export const NotInviteeException = new ForbiddenException([{ message: E.notInvitee, path: 'id' }])
export const NotInviteOwnerException = new ForbiddenException([{ message: E.notInviteOwner, path: 'id' }])
export const DuplicateActiveCollaborationException = new ConflictException([
  { message: E.duplicateActiveCollaboration, path: 'assistantId' }
])
export const AssistantNotFoundException = new NotFoundException([{ message: E.assistantNotFound, path: 'assistantId' }])
export const TargetNotAssistantException = new UnprocessableEntityException([
  { message: E.targetNotAssistant, path: 'assistantId' }
])
export const AssignmentNotFoundException = new NotFoundException([{ message: E.assignmentNotFound, path: 'id' }])
export const AssignmentNotActiveException = new ConflictException([{ message: E.assignmentNotActive, path: 'id' }])
export const NotAssignmentOwnerException = new ForbiddenException([{ message: E.notAssignmentOwner, path: 'id' }])
export const InvalidHirePeriodException = new UnprocessableEntityException([
  { message: E.invalidHirePeriod, path: 'hireEnd' }
])
