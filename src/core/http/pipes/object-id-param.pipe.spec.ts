import { NotFoundException } from '@nestjs/common'
import { ObjectIdParamPipe } from './object-id-param.pipe'

describe('ObjectIdParamPipe', () => {
  it('uses the route-specific exception for malformed values', () => {
    const Pipe = ObjectIdParamPipe.for(() => new NotFoundException('Contract.NotFound'))
    const pipe = new Pipe()

    expect(() => pipe.transform('bad-id', { type: 'param' })).toThrow('Contract.NotFound')
  })

  it('returns a valid ObjectId unchanged', () => {
    const Pipe = ObjectIdParamPipe.for(() => new NotFoundException())
    const pipe = new Pipe()
    const id = 'a'.repeat(24)

    expect(pipe.transform(id, { type: 'param' })).toBe(id)
  })
})
