import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { REQUEST_USER_KEY } from '../auth-type'
import { TokenService } from 'src/infrastructure/token/token.service'
import { SecurityMessages } from '../security.messages'

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    const authHeader = request.headers['authorization']
    // console.log('Auth header:', authHeader)

    const accessToken = authHeader?.split(' ')[1]
    // console.log('Access token:', accessToken)

    if (!accessToken) {
      throw new UnauthorizedException(SecurityMessages.accessTokenRequired)
    }
    try {
      const decodedAccessToken = await this.tokenService.verifyAccessToken(accessToken as string)
      // console.log('Decoded:', decodedAccessToken)
      request[REQUEST_USER_KEY] = decodedAccessToken
      return true
    } catch (error) {
      console.error('Token verify error:', error)
      throw new UnauthorizedException(SecurityMessages.invalidAccessToken)
    }
  }
}
