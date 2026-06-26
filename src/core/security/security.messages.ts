// Centralized messages emitted by the security layer (auth/role guards).
// Plain strings only. `mustChangePassword` is an `Error.*` code FE maps to text;
// the others are literal guard messages kept as-is for backward compatibility.
export const SecurityMessages = {
  accessTokenRequired: 'Access token is required',
  invalidAccessToken: 'Invalid access token',
  unauthorized: 'Unauthorized',
  mustChangePassword: 'Error.MustChangePassword',
  forbiddenResource: 'You do not have permission to access this resource'
} as const
