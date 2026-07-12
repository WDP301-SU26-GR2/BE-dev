export interface AccessTokenPayloadCreate {
  userId: string
  email: string
  roleName: string
  mustChangePassword: boolean
}
export interface JwtAccessTokenPayload extends AccessTokenPayloadCreate {
  exp: number
  iat: number
}

export interface RefreshTokenPayloadCreate {
  userId: string
}
export interface JwtRefreshTokenPayload extends RefreshTokenPayloadCreate {
  /** Nonce mỗi lần ký — xem TokenService.signRefreshToken (chống JWT trùng chuỗi trong cùng 1 giây). */
  jti: string
  exp: number
  iat: number
}
