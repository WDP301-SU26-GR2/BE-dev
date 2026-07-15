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
})
