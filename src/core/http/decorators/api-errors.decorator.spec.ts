import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { buildApiErrorSpecs, extractCode } from './api-errors.decorator'

describe('extractCode', () => {
  it('extracts code from a plain exception message', () => {
    expect(extractCode(new NotFoundException('Error.ChapterNotFound'))).toBe('Error.ChapterNotFound')
  })

  it('extracts code and path from a field-level 422 exception', () => {
    const exception = new UnprocessableEntityException([{ message: 'Error.NameNotApproved', path: 'nameId' }])

    expect(extractCode(exception)).toBe('Error.NameNotApproved (nameId)')
  })

  it('joins multiple issues in one 422 exception', () => {
    const exception = new UnprocessableEntityException([
      { message: 'Error.X', path: 'a' },
      { message: 'Error.Y', path: 'b' }
    ])

    expect(extractCode(exception)).toBe('Error.X (a), Error.Y (b)')
  })
})

describe('buildApiErrorSpecs', () => {
  it('groups exceptions with the same status into one spec', () => {
    const specs = buildApiErrorSpecs([
      new ConflictException('Error.TasksNotAllApproved'),
      new ConflictException('Error.InvalidManuscriptTransition')
    ])

    expect(specs).toHaveLength(1)
    expect(specs[0].status).toBe(409)
    expect(specs[0].description).toContain('Error.TasksNotAllApproved')
    expect(specs[0].description).toContain(' | ')
  })

  it('appends hint from ERROR_HINTS when present', () => {
    const specs = buildApiErrorSpecs([new NotFoundException('Error.ChapterNotFound')])

    expect(specs[0].description).toBe(
      'Error.ChapterNotFound - chapter does not exist (or id is not a valid ObjectId) — used by POST /chapters/:id/names (Spec 10)'
    )
  })

  it('adds the stable code and Vietnamese message to the Swagger example', () => {
    const [spec] = buildApiErrorSpecs([new NotFoundException('Error.ChapterNotFound')])

    expect(spec.content['application/json'].example).toEqual({
      success: false,
      statusCode: 404,
      code: 'Error.ChapterNotFound',
      message: 'Không tìm thấy chương'
    })
  })

  it('creates one spec for each distinct status', () => {
    const specs = buildApiErrorSpecs([
      new ForbiddenException('Error.NotSeriesOwner'),
      new NotFoundException('Error.ChapterNotFound')
    ])
    const statuses = specs.map((spec) => spec.status).sort()

    expect(statuses).toEqual([403, 404])
  })
})
