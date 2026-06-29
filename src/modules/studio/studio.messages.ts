// Centralized user-facing message codes for the studio module — single source of truth.
// Plain strings only (no NestJS imports). HTTP status + path live in errors/studio.errors.ts.
export const StudioMessages = {
  error: {
    inviteNotFound: 'Error.InviteNotFound',
    inviteNotPending: 'Error.InviteNotPending',
    notInvitee: 'Error.NotInvitee',
    notInviteOwner: 'Error.NotInviteOwner',
    duplicateActiveCollaboration: 'Error.DuplicateActiveCollaboration',
    assistantNotFound: 'Error.AssistantNotFound',
    targetNotAssistant: 'Error.TargetNotAssistant',
    assignmentNotFound: 'Error.AssignmentNotFound',
    assignmentNotActive: 'Error.AssignmentNotActive',
    notAssignmentOwner: 'Error.NotAssignmentOwner',
    invalidHirePeriod: 'Error.InvalidHirePeriod'
  }
} as const
