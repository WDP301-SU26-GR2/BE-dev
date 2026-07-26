import { CallHandler, ExecutionContext, HttpException } from '@nestjs/common'
import { firstValueFrom, of, throwError } from 'rxjs'
import { RuntimeMetricsInterceptor } from './runtime-metrics.interceptor'

function makeContext(statusCode = 200): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', baseUrl: '/series', route: { path: '/:id' } }),
      getResponse: () => ({ statusCode }),
      getNext: () => undefined
    }),
    getClass: () => class SeriesController {},
    getHandler: () => function getOne() {},
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({ getContext: () => undefined, getData: () => undefined }),
    switchToWs: () => ({ getClient: () => undefined, getData: () => undefined, getPattern: () => undefined })
  } as unknown as ExecutionContext
}

describe('RuntimeMetricsInterceptor', () => {
  it('records successful requests using the route template, not a raw URL', async () => {
    const metrics = { recordHttp: jest.fn() }
    const interceptor = new RuntimeMetricsInterceptor(metrics as never)
    const next: CallHandler = { handle: () => of({ ok: true }) }

    await firstValueFrom(interceptor.intercept(makeContext(201), next))

    expect(metrics.recordHttp).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', route: '/series/:id', statusCode: 201 })
    )
  })

  it('records HttpException status and preserves the error', async () => {
    const metrics = { recordHttp: jest.fn() }
    const interceptor = new RuntimeMetricsInterceptor(metrics as never)
    const error = new HttpException('no', 403)

    await expect(
      firstValueFrom(interceptor.intercept(makeContext(), { handle: () => throwError(() => error) }))
    ).rejects.toBe(error)
    expect(metrics.recordHttp).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }))
  })
})
