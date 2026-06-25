import { Injectable } from '@nestjs/common'
import { OAuth2Client } from 'google-auth-library'
import envConfig from 'src/core/config/envConfig'

export interface GoogleIdTokenPayload {
  email: string
  emailVerified: boolean
  sub: string
  name?: string
  picture?: string
}

@Injectable()
export class GoogleTokenVerifier {
  private readonly client = new OAuth2Client(envConfig.GOOGLE_CLIENT_ID)

  async verify(idToken: string): Promise<GoogleIdTokenPayload> {
    const ticket = await this.client.verifyIdToken({ idToken, audience: envConfig.GOOGLE_CLIENT_ID })
    const payload = ticket.getPayload()
    if (!payload || !payload.email || !payload.sub) {
      throw new Error('Invalid Google token payload')
    }
    return {
      email: payload.email,
      emailVerified: payload.email_verified === true,
      sub: payload.sub,
      name: payload.name,
      picture: payload.picture
    }
  }
}
