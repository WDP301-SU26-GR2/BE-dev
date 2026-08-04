import {
  conditionStatusLabel,
  decisionResultLabel,
  decisionTypeLabel,
  fmtTerminationClause,
  formatContractNo
} from './contract-pdf.helpers'

describe('contract-pdf helpers', () => {
  describe('formatContractNo', () => {
    it('derives HĐXB-YYYYMMDD-6HEX from id + createdAt', () => {
      expect(formatContractNo('6a7189124a2dccdc45d4eef5', '2026-08-04T06:39:00.000Z')).toBe('HĐXB-20260804-D4EEF5')
    })

    it('falls back gracefully when createdAt is invalid (still HĐXB-…-6HEX)', () => {
      const res = formatContractNo('6a7189124a2dccdc45d4eef5', 'not-a-date')
      expect(res).toMatch(/^HĐXB-\d{8}-D4EEF5$/)
    })
  })

  describe('enum labels (Vietnamese) with fallback', () => {
    it('decisionTypeLabel', () => {
      expect(decisionTypeLabel('SERIALIZATION')).toBe('Serial hóa')
      expect(decisionTypeLabel('CANCELLATION')).toBe('Hủy series')
      expect(decisionTypeLabel('WEIRD_VALUE')).toBe('WEIRD_VALUE')
      expect(decisionTypeLabel(null)).toBe('—')
    })

    it('decisionResultLabel', () => {
      expect(decisionResultLabel('APPROVED')).toBe('Đã duyệt')
      expect(decisionResultLabel('REJECTED')).toBe('Từ chối')
      expect(decisionResultLabel('X')).toBe('X')
      expect(decisionResultLabel(null)).toBe('—')
    })

    it('conditionStatusLabel', () => {
      expect(conditionStatusLabel('ACHIEVED')).toBe('Đã đạt')
      expect(conditionStatusLabel('MISSED')).toBe('Bỏ lỡ')
      expect(conditionStatusLabel('X')).toBe('X')
    })
  })

  describe('fmtTerminationClause', () => {
    it('formats structured JSON clause', () => {
      const res = fmtTerminationClause(JSON.stringify({ compensationPct: 10, policy: 'Trả mốc đã đạt.' }))
      expect(res).toContain('10%')
      expect(res).toContain('Trả mốc đã đạt.')
    })

    it('formats simple key:value clause (compensation:100)', () => {
      expect(fmtTerminationClause('compensation:100')).toContain('100%')
    })

    it('keeps plain free text verbatim', () => {
      expect(fmtTerminationClause('Điều khoản tự do do biên tập nhập.')).toBe('Điều khoản tự do do biên tập nhập.')
    })

    it('empty/null → dash', () => {
      expect(fmtTerminationClause(null)).toBe('—')
      expect(fmtTerminationClause('   ')).toBe('—')
    })
  })
})
