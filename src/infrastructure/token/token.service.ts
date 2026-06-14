import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService, JwtSignOptions } from '@nestjs/jwt'
import envConfig from 'src/core/config/envConfig'
import {
  AccessTokenPayloadCreate,
  JwtAccessTokenPayload,
  JwtRefreshTokenPayload,
  RefreshTokenPayloadCreate
} from './jwt.type'

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  signAccessToken(payload: AccessTokenPayloadCreate): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: envConfig.ACCESS_TOKEN_SECRET,
      expiresIn: envConfig.ACCESS_TOKEN_EXPIRES_IN,
      algorithm: 'HS256'
    } as JwtSignOptions)
  }

  signRefreshToken(payload: RefreshTokenPayloadCreate): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: envConfig.REFRESH_TOKEN_SECRET,
      expiresIn: envConfig.REFRESH_TOKEN_EXPIRES_IN,
      algorithm: 'HS256'
    } as JwtSignOptions)
  }

  verifyAccessToken(token: string): Promise<JwtAccessTokenPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: envConfig.ACCESS_TOKEN_SECRET,
      algorithms: ['HS256']
    })
  }

  verifyRefreshToken(token: string): Promise<JwtRefreshTokenPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: envConfig.REFRESH_TOKEN_SECRET,
      algorithms: ['HS256']
    })
  }

  decodeRefreshToken(token: string): JwtRefreshTokenPayload {
    const decoded = this.jwtService.decode(token)
    if (!decoded || typeof decoded === 'string') throw new UnauthorizedException('Invalid token')
    return decoded as JwtRefreshTokenPayload
  }
}
