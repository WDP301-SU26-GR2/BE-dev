// Centralized generic messages produced at the HTTP layer (error envelope / safety net).
// Module-specific messages live in `src/modules/<name>/<name>.messages.ts`.
export const HttpMessages = {
  validationFailed: 'Validation failed',
  recordAlreadyExists: 'Record already exists',
  internalServerError: 'Internal server error'
} as const
