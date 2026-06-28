// Centralized user-facing messages for the users module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/users.errors.ts`, which references the `error` codes below.
export const UsersMessages = {
  // Error codes (FE maps these keys to localized text). Consumed by errors/users.errors.ts.
  error: {
    emailAlreadyExists: 'Error.EmailAlreadyExists',
    profileNotFound: 'Error.ProfileNotFound',
    userNotFound: 'Error.UserNotFound'
  }
} as const
