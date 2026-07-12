import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService, JwtSignOptions } from '@nestjs/jwt'
import { randomUUID } from 'node:crypto'
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

  // 🔴 `jti` BẮT BUỘC: payload cũ chỉ {userId} + iat/exp (giây) ⇒ 2 lần ký trong CÙNG 1 GIÂY cho ra
  // JWT byte-identical. Hệ quả thật (lộ ở flowtest khi DB có index): `RefreshToken.token @unique`
  // → login/refresh 2 lần liền nhau ném P2002 → 409 "Record already exists"; và rotation
  // (delete-old-row) mất tác dụng vì token "mới" trùng token "cũ" → replay được trong cửa sổ 1s.
  signRefreshToken(payload: RefreshTokenPayloadCreate): Promise<string> {
    return this.jwtService.signAsync({ ...payload, jti: randomUUID() }, {
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
