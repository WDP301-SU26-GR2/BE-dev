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
})
