import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { REQUEST_USER_KEY } from '../constants/auth-type'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { JwtAccessTokenPayload } from 'src/infrastructure/token/jwt.type'
import { RoleNameType } from '../constants/role.constant'
import { SecurityMessages } from '../security.messages'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<RoleNameType[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ])

    if (!roles || roles.length === 0) return true

    const request = context.switchToHttp().getRequest()
    const user = request[REQUEST_USER_KEY] as JwtAccessTokenPayload | undefined

    if (!user || !roles.includes(user.roleName as RoleNameType)) {
      throw new ForbiddenException(SecurityMessages.forbiddenResource)
    }

    return true
  }
}
