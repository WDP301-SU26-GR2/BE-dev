export interface AccessTokenPayloadCreate {
  userId: string
  roleId: string
  roleName: string
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
