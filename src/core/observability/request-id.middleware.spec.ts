import type { NextFunction, Request, Response } from 'express'
import { RequestIdMiddleware } from './request-id.middleware'

describe('RequestIdMiddleware', () => {
  const run = (headerValue?: string) => {
    const next = jest.fn() as NextFunction
    const request = { header: jest.fn().mockReturnValue(headerValue) } as unknown as Request
    const setHeader = jest.fn()
    const response = { setHeader } as unknown as Response
    const context = { run: jest.fn((_requestId: string, callback: NextFunction) => callback()) }
    const middleware = new RequestIdMiddleware(context as never)

    middleware.use(request, response, next)
    return { context, next, setHeader }
  }

  it('propagates a bounded caller request ID through the async context', () => {
    const { context, next, setHeader } = run('  request-123  ')

    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'request-123')
    expect(context.run.mock.calls[0]).toEqual(['request-123', next])
    expect(next).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, '', 'x'.repeat(129)])('generates an ID when the supplied value is absent or unsafe', (value) => {
    const { context, setHeader } = run(value)
    const generated = context.run.mock.calls[0][0]

    expect(generated).toMatch(/^[0-9a-f-]{36}$/)
    expect(setHeader).toHaveBeenCalledWith('x-request-id', generated)
  })
})
