import { normalizeMagazine } from './magazine.schema'

describe('normalizeMagazine', () => {
  it('cắt khoảng trắng đầu/cuối', () => {
    expect(normalizeMagazine(' FT Jump ')).toBe('FT Jump')
  })
  it('gộp nhiều khoảng trắng giữa thành một', () => {
    expect(normalizeMagazine('FT   Jump')).toBe('FT Jump')
  })
  it('giữ nguyên chuỗi đã chuẩn', () => {
    expect(normalizeMagazine('FT Jump SQ')).toBe('FT Jump SQ')
  })
  it('chuỗi toàn khoảng trắng thành rỗng', () => {
    expect(normalizeMagazine('   ')).toBe('')
  })
})
