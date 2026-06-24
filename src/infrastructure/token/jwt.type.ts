export interface AccessTokenPayloadCreate {
  userId: string
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
  exp: number
  iat: number
}
