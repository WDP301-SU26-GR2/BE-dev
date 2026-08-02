import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { MetricsApiKeyGuard } from './metrics-api-key.guard'

jest.mock('src/core/config/envConfig', () => ({
  __esModule: true,
  default: { API_KEY: 'metrics-secret-that-must-never-be-returned' }
}))

const contextWithApiKey = (apiKey?: string | string[]) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: apiKey === undefined ? {} : { 'x-api-key': apiKey } })
    })
  }) as unknown as ExecutionContext

describe('MetricsApiKeyGuard', () => {
  const guard = new MetricsApiKeyGuard()

  it('allows Prometheus scraping with the configured API key', () => {
    expect(guard.canActivate(contextWithApiKey('metrics-secret-that-must-never-be-returned'))).toBe(true)
  })

  it.each([
    ['missing', undefined],
    ['wrong', 'wrong-metrics-key'],
    ['ambiguous', ['metrics-secret-that-must-never-be-returned', 'another-key']]
  ])('rejects a %s API key with a clean 401 without exposing the configured key', (_case, apiKey) => {
    let thrown: unknown
    try {
      guard.canActivate(contextWithApiKey(apiKey))
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(UnauthorizedException)
    expect((thrown as UnauthorizedException).getStatus()).toBe(401)
    expect((thrown as UnauthorizedException).getResponse()).toMatchObject({
      message: 'Error.InvalidMetricsApiKey'
    })
    expect(JSON.stringify(thrown)).not.toContain('metrics-secret-that-must-never-be-returned')
  })
})
