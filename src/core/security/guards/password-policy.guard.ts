import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtAccessTokenPayload } from 'src/infrastructure/token/jwt.type'
import { REQUEST_USER_KEY } from '../constants/auth-type'
import { SKIP_PASSWORD_POLICY_KEY } from '../decorators/skip-password-policy.decorator'
import { SecurityMessages } from '../security.messages'

@Injectable()
export class PasswordPolicyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_PASSWORD_POLICY_KEY, [
      context.getHandler(),
      context.getClass()
    ])
    if (skip) return true

    const request = context.switchToHttp().getRequest()
    const user = request[REQUEST_USER_KEY] as JwtAccessTokenPayload | undefined
    if (!user) return true

    if (user.mustChangePassword === true) {
      throw new ForbiddenException(SecurityMessages.mustChangePassword)
    }

    return true
  }
}
