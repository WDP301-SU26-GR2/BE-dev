import { SetMetadata } from '@nestjs/common'
import { AuthType, AuthTypeType, ConditionGuard, ConditionGuardType } from '../auth-type'
import envConfig from '../../config/envConfig'

export const Auth = (authType: AuthTypeType[], options?: { condition: ConditionGuardType }) => {
  return SetMetadata(envConfig.AUTH_TYPE_KEY, { authType, options: options ?? { condition: ConditionGuard.And } })
}

export const IsPublic = () => Auth([AuthType.None])
