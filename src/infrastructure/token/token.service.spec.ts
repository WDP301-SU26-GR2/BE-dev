import { JwtService } from '@nestjs/jwt'
import { TokenService } from './token.service'

// FINDING-BE-013 (flowtest 2026-07-11): refresh JWT payload cũ = {userId} + iat/exp (giây)
// → 2 lần ký trong CÙNG 1 GIÂY sinh chuỗi TRÙNG NHAU. Với `RefreshToken.token @unique`:
//   - login/refresh 2 lần liền nhau → P2002 → 409 "Record already exists"
//   - rotation (delete-old-row) vô hiệu: token "mới" === token "cũ" → replay được
// Fix = thêm `jti` ngẫu nhiên mỗi lần ký.
describe('TokenService.signRefreshToken — jti nonce (FINDING-BE-013)', () => {
  const makeService = () => new TokenService(new JwtService({}))

  it('2 lần ký LIÊN TIẾP (cùng 1 giây, cùng userId) → 2 chuỗi token KHÁC NHAU', async () => {
    const service = makeService()
    const [t1, t2] = await Promise.all([
      service.signRefreshToken({ userId: 'u1' }),
      service.signRefreshToken({ userId: 'u1' })
    ])
    expect(t1).not.toEqual(t2)
  })

  it('payload chứa jti (uuid) + userId; verify vẫn đọc được userId', async () => {
    const service = makeService()
    const token = await service.signRefreshToken({ userId: 'u1' })
    const payload = await service.verifyRefreshToken(token)
    expect(payload.userId).toBe('u1')
    expect(typeof payload.jti).toBe('string')
    expect(payload.jti.length).toBeGreaterThan(10)
  })
})
