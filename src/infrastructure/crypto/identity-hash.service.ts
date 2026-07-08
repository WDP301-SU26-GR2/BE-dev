import { Inject, Injectable } from '@nestjs/common'
import { createHmac } from 'crypto'

// DI token for the HMAC pepper (secret). Supplied from envConfig in CoreModule so the
// service class itself stays free of envConfig import → unit-testable without env boot.
export const IDENTITY_HASH_PEPPER = 'IDENTITY_HASH_PEPPER'

// Deterministic keyed hash for guest identity (phone/email) + IP (B-VOT-03, NFR §1/§5).
// HMAC-SHA256(pepper, value): same input → same digest (required for "1 identity = 1 vote/period"
// dedup), and non-reversible + peppered so a DB leak can't brute-force raw identities.
// NOT bcrypt — bcrypt salts randomly and is non-deterministic (breaks dedup). bcrypt stays for passwords/OTP.
@Injectable()
export class IdentityHashService {
  constructor(@Inject(IDENTITY_HASH_PEPPER) private readonly pepper: string) {}

  hash(value: string): string {
    return createHmac('sha256', this.pepper).update(value).digest('hex')
  }
}
