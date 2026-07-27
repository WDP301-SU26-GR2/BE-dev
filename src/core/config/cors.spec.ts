import { parseCorsOrigins } from './cors'

describe('parseCorsOrigins', () => {
  it.each(['', '   '])('returns wildcard for an empty value', (raw) => {
    expect(parseCorsOrigins(raw)).toBe('*')
  })

  it('returns a one-element array for one origin', () => {
    expect(parseCorsOrigins('https://app.example.com')).toEqual(['https://app.example.com'])
  })

  it('splits comma-separated origins and trims each origin', () => {
    expect(parseCorsOrigins(' https://app.example.com, https://admin.example.com ')).toEqual([
      'https://app.example.com',
      'https://admin.example.com'
    ])
  })

  it('drops empty comma-separated elements', () => {
    expect(parseCorsOrigins('https://app.example.com, , ,https://admin.example.com,')).toEqual([
      'https://app.example.com',
      'https://admin.example.com'
    ])
  })

  // Browsers send the `Origin` header WITHOUT a trailing slash / path, and CORS matching is exact.
  // Strip a configured trailing slash so `https://app.example.com/` still matches the real origin.
  it('strips a trailing slash from each origin', () => {
    expect(parseCorsOrigins('https://app.example.com/, http://localhost:3000/')).toEqual([
      'https://app.example.com',
      'http://localhost:3000'
    ])
  })

  it('collapses multiple trailing slashes too', () => {
    expect(parseCorsOrigins('https://app.example.com///')).toEqual(['https://app.example.com'])
  })

  it.each(['', '*', 'http://app.example.com'])('rejects unsafe production origins', (raw) => {
    expect(() => parseCorsOrigins(raw, 'production')).toThrow('CORS_ORIGINS')
  })

  it('allows explicit HTTP localhost origins in production only when opted in', () => {
    expect(
      parseCorsOrigins('https://app.example.com,http://localhost:5173,http://127.0.0.1:3000', 'production', true)
    ).toEqual(['https://app.example.com', 'http://localhost:5173', 'http://127.0.0.1:3000'])
    // Truyền `false` TƯỜNG MINH: bỏ trống thì tham số rơi về default `envConfig.ALLOW_INSECURE_LOCAL_CORS`,
    // nghĩa là test đọc `.env` của từng máy → đỏ/xanh tuỳ máy. `.env` không commit nên không sửa được ở đó.
    expect(() => parseCorsOrigins('http://localhost:5173', 'production', false)).toThrow('CORS_ORIGINS')
    expect(() => parseCorsOrigins('http://192.168.1.8:5173', 'production', true)).toThrow('CORS_ORIGINS')
  })
})
