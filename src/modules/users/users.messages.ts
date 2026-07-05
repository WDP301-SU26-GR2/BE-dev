// Centralized user-facing messages for the users module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/users.errors.ts`, which references the `error` codes below.
export const UsersMessages = {
  response: {
    userStatusUpdated: 'User status updated successfully',
    userDeleted: 'User deleted successfully',
    userRestored: 'User restored successfully'
  },
  notification: {
    banned: (reason?: string) => `Your account has been banned${reason ? `: ${reason}` : ''}`,
    blocked: (reason?: string) => `Your account has been blocked${reason ? `: ${reason}` : ''}`,
    reactivated: 'Your account has been reactivated'
  },
  // Error codes (FE maps these keys to localized text). Consumed by errors/users.errors.ts.
  error: {
    emailAlreadyExists: 'Error.EmailAlreadyExists',
    profileNotFound: 'Error.ProfileNotFound',
    userNotFound: 'Error.UserNotFound',
    cannotModifyAdminUser: 'Error.CannotModifyAdminUser',
    userAlreadyDeleted: 'Error.UserAlreadyDeleted',
    userNotDeleted: 'Error.UserNotDeleted'
  }
} as const
