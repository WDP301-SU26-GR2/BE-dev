import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { REQUEST_USER_KEY } from '../constants/auth-type'
import { TokenService } from 'src/infrastructure/token/token.service'
import { SecurityMessages } from '../security.messages'

@Injectable()
export class AccessTokenGuard implements CanActivate {
  private readonly logger = new Logger(AccessTokenGuard.name)

  constructor(private readonly tokenService: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    const authHeader = request.headers['authorization']
    const accessToken = authHeader?.split(' ')[1]

    if (!accessToken) {
      throw new UnauthorizedException(SecurityMessages.accessTokenRequired)
    }
    try {
      const decodedAccessToken = await this.tokenService.verifyAccessToken(accessToken as string)
      request[REQUEST_USER_KEY] = decodedAccessToken
      return true
    } catch {
      this.logger.warn('Access token verification failed')
      throw new UnauthorizedException(SecurityMessages.invalidAccessToken)
    }
  }
}
