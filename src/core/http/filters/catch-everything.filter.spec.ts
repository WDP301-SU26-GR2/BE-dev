import { ArgumentsHost, ForbiddenException, Logger, UnprocessableEntityException } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { CatchEverythingFilter } from './catch-everything.filter'

function createHost() {
  const response = {}
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({})
    })
  } as unknown as ArgumentsHost
}

function createFilter() {
  const reply = jest.fn()
  const httpAdapterHost = { httpAdapter: { reply } } as unknown as HttpAdapterHost
  const filter = new CatchEverythingFilter(httpAdapterHost)
  return { filter, reply }
}

describe('CatchEverythingFilter', () => {
  it('flattens UnprocessableEntityException to a top-level message (no nested object)', () => {
    const { filter, reply } = createFilter()
    const exception = new UnprocessableEntityException([{ message: 'Error.EmailNotFound', path: 'email' }])

    filter.catch(exception, createHost())

    const [, body, status] = reply.mock.calls[0]
    expect(status).toBe(422)
    expect(body).toEqual({
      success: false,
      statusCode: 422,
      message: [{ message: 'Error.EmailNotFound', path: 'email' }]
    })
  })

  it('keeps a string message for a simple HttpException', () => {
    const { filter, reply } = createFilter()

    filter.catch(new ForbiddenException('Error.EmailNotVerified'), createHost())

    const [, body] = reply.mock.calls[0]
    expect(body).toEqual({ success: false, statusCode: 403, message: 'Error.EmailNotVerified' })
  })

  it('maps Prisma unique-constraint errors to 409 Conflict', () => {
    const { filter, reply } = createFilter()
    const prismaError = new PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6.19.0' })

    filter.catch(prismaError, createHost())

    const [, body, status] = reply.mock.calls[0]
    expect(status).toBe(409)
    expect(body).toEqual({ success: false, statusCode: 409, message: 'Record already exists' })
  })

  it('maps unknown errors to 500 without leaking internals', () => {
    const { filter, reply } = createFilter()
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    filter.catch(new Error('boom'), createHost())
    logSpy.mockRestore()

    const [, body, status] = reply.mock.calls[0]
    expect(status).toBe(500)
    expect(body).toEqual({ success: false, statusCode: 500, message: 'Internal server error' })
  })
})
