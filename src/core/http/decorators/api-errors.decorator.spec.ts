import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { buildApiErrorSpecs, extractCode } from './api-errors.decorator'

describe('extractCode', () => {
  it('lấy code từ exception message đơn', () => {
    expect(extractCode(new NotFoundException('Error.ChapterNotFound'))).toBe('Error.ChapterNotFound')
  })

  it('lấy code + path từ 422 field-level', () => {
    const exception = new UnprocessableEntityException([{ message: 'Error.NameNotApproved', path: 'nameId' }])

    expect(extractCode(exception)).toBe('Error.NameNotApproved (nameId)')
  })

  it('ghép nhiều issue trong 1 exception 422', () => {
    const exception = new UnprocessableEntityException([
      { message: 'Error.X', path: 'a' },
      { message: 'Error.Y', path: 'b' }
    ])

    expect(extractCode(exception)).toBe('Error.X (a), Error.Y (b)')
  })
})

describe('buildApiErrorSpecs', () => {
  it('gộp các exception cùng status thành 1 spec', () => {
    const specs = buildApiErrorSpecs([
      new ConflictException('Error.PagesNotAllCompleted'),
      new ConflictException('Error.InvalidManuscriptTransition')
    ])

    expect(specs).toHaveLength(1)
    expect(specs[0].status).toBe(409)
    expect(specs[0].description).toContain('Error.PagesNotAllCompleted')
    expect(specs[0].description).toContain(' | ')
  })

  it('append hint từ ERROR_HINTS khi có', () => {
    const specs = buildApiErrorSpecs([new NotFoundException('Error.ChapterNotFound')])

    expect(specs[0].description).toBe('Error.ChapterNotFound — chapter/series không tồn tại')
  })

  it('mỗi status khác nhau tạo 1 spec riêng', () => {
    const specs = buildApiErrorSpecs([
      new ForbiddenException('Error.NotSeriesOwner'),
      new NotFoundException('Error.ChapterNotFound')
    ])
    const statuses = specs.map((spec) => spec.status).sort()

    expect(statuses).toEqual([403, 404])
  })
})
