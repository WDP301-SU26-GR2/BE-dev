import { OAuth2Client } from 'google-auth-library'
import { GoogleTokenVerifier } from './google-token-verifier.service'

jest.mock('google-auth-library')

const mockVerifyIdToken = jest.fn()
;(OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({ verifyIdToken: mockVerifyIdToken }))

describe('GoogleTokenVerifier', () => {
  beforeEach(() => mockVerifyIdToken.mockReset())

  it('maps a valid Google ticket to a normalized payload', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'u@x.com', email_verified: true, sub: 'sub-1', name: 'U', picture: 'p' })
    })
    const verifier = new GoogleTokenVerifier()

    const payload = await verifier.verify('tok')

    expect(payload).toEqual({ email: 'u@x.com', emailVerified: true, sub: 'sub-1', name: 'U', picture: 'p' })
  })

  it('throws when the ticket has no usable payload', async () => {
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => undefined })
    const verifier = new GoogleTokenVerifier()

    await expect(verifier.verify('tok')).rejects.toThrow()
  })
})
