import { readFileSync, readdirSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { ERROR_HINTS } from './error-docs'
import {
  ERROR_TEXT_VI,
  MESSAGE_CATALOGS,
  buildErrorTextRegistry,
  isKnownCode,
  translateErrorCode
} from './error-text.registry'

const ERROR_CODE_PATTERN = /^Error\.[A-Z][A-Za-z0-9]*$/

// Quét mọi `**/errors/*.ts` dưới src/ (bỏ file test) để soi `code:` literal khai tay.
function collectErrorFiles(root: string): string[] {
  const found: string[] = []

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full)
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') && basename(dir) === 'errors') {
        found.push(full)
      }
    }
  }

  walk(root)
  return found
}

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

  // Convention guard (AGENTS §7): mã lỗi phải là `Error.PascalCase` để FE phân nhánh ổn định.
  // Trước 2026-07-20 tồn tại 2 lớp mã legacy: câu tiếng Anh nguyên văn (guard 401/403) và
  // SCREAMING_SNAKE (contract/payment/transfer). Test này chặn tái phát — thêm mã mới sai dạng là đỏ ngay.
  it('declares every catalog error code in Error.PascalCase form', () => {
    const violations = MESSAGE_CATALOGS.flatMap(({ name, catalog }) =>
      Object.entries(catalog.error ?? {})
        .filter(([, code]) => !ERROR_CODE_PATTERN.test(code))
        .map(([key, code]) => `${name}.${key}: ${code}`)
    )

    expect(violations).toEqual([])
  })

  it('keys every Vietnamese translation by an Error.PascalCase code', () => {
    expect(Object.keys(ERROR_TEXT_VI).filter((code) => !ERROR_CODE_PATTERN.test(code))).toEqual([])
  })

  // Hai test trên chỉ thấy mã đi qua catalog. Rate-limit exception lại khai `code` TƯỜNG MINH ngay trong
  // errors file (HttpException({ message, code, retryAfter })) — nằm ngoài tầm nhìn của catalog, nên
  // 3 mã ..._RATE_LIMITED từng lọt lưới. Test này quét source để chặn đúng lỗ hổng đó.
  it('never hard-codes a non-conforming error code inside errors/*.ts', () => {
    const errorFiles = collectErrorFiles(join(__dirname, '..', '..', '..'))
    expect(errorFiles.length).toBeGreaterThan(0)

    const violations = errorFiles.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return [...source.matchAll(/\bcode:\s*'([^']+)'/g)]
        .map((match) => match[1])
        .filter((code) => !ERROR_CODE_PATTERN.test(code))
        .map((code) => `${relative(process.cwd(), file)}: ${code}`)
    })

    expect(violations).toEqual([])
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
    // isKnownCode là bộ PHÂN LOẠI tolerant (không phải bộ enforce convention): nó vẫn nhận dạng
    // SCREAMING_SNAKE để lỗi raw-string lọt lưới vẫn có `code` ổn định thay vì null.
    expect(isKnownCode('SOME_LEGACY_RAW_CODE')).toBe(true)
    expect(isKnownCode('văn bản thông thường')).toBe(false)
    expect(translateErrorCode('Error.NotYetTranslated')).toBe('Error.NotYetTranslated')
  })
})
