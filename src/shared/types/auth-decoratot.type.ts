import { AuthTypeType, ConditionGuardType } from 'src/shared/constant/auth.constant'

export type AuthTypeDecoratorPayload = {
  authType: AuthTypeType[]
  options: { condition: ConditionGuardType }
}
