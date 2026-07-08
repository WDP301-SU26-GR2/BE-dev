import { IdentityHashService } from './identity-hash.service'

// B-VOT-03 fix: guest identity/ip hashing MUST be deterministic (HMAC + pepper),
// NOT bcrypt. bcrypt salts randomly → same phone hashes differently every call →
// the "1 identity = 1 vote/period" dedup (findUnique + unique constraint) never matches.
describe('IdentityHashService', () => {
  const svc = new IdentityHashService('test-pepper')

  it('is deterministic: same input → same digest (enables dedup)', () => {
    expect(svc.hash('+84900000000')).toBe(svc.hash('+84900000000'))
  })

  it('does not return the plaintext and yields a 64-char hex sha256 digest', () => {
    const digest = svc.hash('+84900000000')
    expect(digest).not.toBe('+84900000000')
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('different inputs → different digests', () => {
    expect(svc.hash('+84900000000')).not.toBe(svc.hash('+84900000001'))
  })

  it('is keyed by the pepper: different pepper → different digest for same input', () => {
    const other = new IdentityHashService('another-pepper')
    expect(svc.hash('+84900000000')).not.toBe(other.hash('+84900000000'))
  })
})
