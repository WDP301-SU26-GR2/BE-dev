export const REQUEST_USER_KEY = 'user' as const

export const AuthType = {
  Bearer: 'Bearer',
  None: 'None'
} as const
export type AuthTypeType = (typeof AuthType)[keyof typeof AuthType]

export const ConditionGuard = {
  Or: 'Or',
  And: 'And'
} as const
export type ConditionGuardType = (typeof ConditionGuard)[keyof typeof ConditionGuard]

export type AuthTypeDecoratorPayload = {
  authType: AuthTypeType[]
  options: { condition: ConditionGuardType }
}
