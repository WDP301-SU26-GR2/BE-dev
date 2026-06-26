import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AccessTokenGuard } from './access-token.guard'
import envConfig from '../../config/envConfig'
import { AuthType, AuthTypeDecoratorPayload, ConditionGuard } from '../auth-type'
import { SecurityMessages } from '../security.messages'

@Injectable()
export class AuthenticationGuard implements CanActivate {
  private readonly authTypeGuardMap: Record<string, CanActivate>
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokenGuard: AccessTokenGuard
  ) {
    this.authTypeGuardMap = {
      [AuthType.Bearer]: this.accessTokenGuard,
      [AuthType.None]: {
        canActivate: () => true
      }
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authTypeValue = this.reflector.getAllAndOverride<AuthTypeDecoratorPayload | undefined>(
      envConfig.AUTH_TYPE_KEY,
      [context.getHandler(), context.getClass()]
    ) ?? { authType: [AuthType.Bearer], options: { condition: ConditionGuard.And } } //nếu undefined thì sẽ trả về giá trị mặc định là authType: [AuthType.None], options: { condition: ConditionGuard.And }
    const guards = authTypeValue.authType.map((authType) => {
      return this.authTypeGuardMap[authType]
    })
    let err = new UnauthorizedException()
    if (authTypeValue.options.condition === ConditionGuard.Or) {
      for (const guard of guards) {
        const result = await Promise.resolve(guard.canActivate(context)).catch((e) => {
          err = e
          return false
        })
        if (result) {
          return true
        }
      }
      throw err
    } else {
      for (const guard of guards) {
        const result = await Promise.resolve(guard.canActivate(context)).catch((e) => {
          err = e
          return false
        })
        if (!result) {
          throw new UnauthorizedException(SecurityMessages.unauthorized)
        }
      }
      return true
    }
  }
}
