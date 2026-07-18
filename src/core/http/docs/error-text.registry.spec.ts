import { ERROR_HINTS } from './error-docs'
import {
  ERROR_TEXT_VI,
  MESSAGE_CATALOGS,
  buildErrorTextRegistry,
  isKnownCode,
  translateErrorCode
} from './error-text.registry'

describe('Vietnamese error text registry', () => {
  it('contains a non-empty Vietnamese message for every registered entry', () => {
    expect(Object.keys(ERROR_TEXT_VI).length).toBeGreaterThan(0)
    for (const [code, text] of Object.entries(ERROR_TEXT_VI)) {
      expect(code.length).toBeGreaterThan(0)
      expect(text.trim().length).toBeGreaterThan(0)
    }
  })

  it('covers every error code declared by every message catalog', () => {
    const missing = MESSAGE_CATALOGS.flatMap(({ name, catalog }) =>
      Object.values(catalog.error ?? {})
        .filter((code) => !(code in ERROR_TEXT_VI))
        .map((code) => `${name}: ${code}`)
    )

    expect(missing).toEqual([])
  })

  it('covers every error code documented by ERROR_HINTS', () => {
    expect(Object.keys(ERROR_HINTS).filter((code) => !(code in ERROR_TEXT_VI))).toEqual([])
  })

  it('rejects conflicting translations for a duplicate code', () => {
    expect(() =>
      buildErrorTextRegistry([
        { name: 'one', catalog: { errorText: { 'Error.Duplicate': 'Bản dịch một' } } },
        { name: 'two', catalog: { errorText: { 'Error.Duplicate': 'Bản dịch hai' } } }
      ])
    ).toThrow('Conflicting Vietnamese error text for Error.Duplicate: one != two')
  })

  it('allows identical duplicate translations and provides safe lookup helpers', () => {
    expect(
      buildErrorTextRegistry([
        { name: 'one', catalog: { errorText: { 'Error.Shared': 'Dùng chung' } } },
        { name: 'two', catalog: { errorText: { 'Error.Shared': 'Dùng chung' } } }
      ])
    ).toEqual({ 'Error.Shared': 'Dùng chung' })
    expect(isKnownCode('Error.NotYetTranslated')).toBe(true)
    expect(isKnownCode('AUTH_OTP_RATE_LIMITED')).toBe(true)
    expect(isKnownCode('văn bản thông thường')).toBe(false)
    expect(translateErrorCode('Error.NotYetTranslated')).toBe('Error.NotYetTranslated')
  })
})
