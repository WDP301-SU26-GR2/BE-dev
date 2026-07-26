import { SecurityMessages } from 'src/core/security/security.messages'
import { TokenService } from './token.service'

describe('TokenService.decodeRefreshToken', () => {
  it.each([null, 'decoded-as-string'])('uses the security catalog for invalid payload %p', (decoded) => {
    const service = new TokenService({ decode: jest.fn().mockReturnValue(decoded) } as never)

    expect(() => service.decodeRefreshToken('invalid')).toThrow(SecurityMessages.invalidAccessToken)
  })
})
