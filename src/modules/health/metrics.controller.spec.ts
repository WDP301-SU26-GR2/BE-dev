import 'reflect-metadata'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import envConfig from 'src/core/config/envConfig'
import { MetricsApiKeyGuard } from './guards/metrics-api-key.guard'
import { MetricsController } from './metrics.controller'
import { MetricsService } from './metrics.service'

const metricsHandler = Object.getOwnPropertyDescriptor(MetricsController.prototype, 'metricsText')?.value as object
const SWAGGER_API_PARAMETERS = 'swagger/apiParameters'
const SWAGGER_API_OPERATION = 'swagger/apiOperation'

describe('Metrics endpoint', () => {
  it('requires the dedicated API-key guard while bypassing user JWT authentication', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, metricsHandler) as unknown[] | undefined
    const auth = Reflect.getMetadata(envConfig.AUTH_TYPE_KEY, metricsHandler) as { authType: string[] } | undefined

    expect(guards).toContain(MetricsApiKeyGuard)
    expect(auth?.authType).toContain('None')
  })

  it('documents x-api-key as a required machine authentication header and is not marked public in Swagger', () => {
    const headers = Reflect.getMetadata(SWAGGER_API_PARAMETERS, metricsHandler) as
      | Array<{ name?: string; required?: boolean; description?: string }>
      | undefined
    const operation = Reflect.getMetadata(SWAGGER_API_OPERATION, metricsHandler) as { security?: unknown[] } | undefined

    expect(headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'x-api-key',
          required: true
        })
      ])
    )
    expect(operation?.security).not.toEqual([])
  })

  it('facade samples runtime dependencies before rendering', async () => {
    const queueDepth = { sample: jest.fn().mockResolvedValue(undefined) }
    const systemMetrics = { sample: jest.fn() }
    const service = new MetricsService(
      { renderPrometheus: () => '# TYPE sample counter\n' } as never,
      queueDepth as never,
      systemMetrics as never
    )

    await expect(service.render()).resolves.toBe('# TYPE sample counter\n')
    expect(queueDepth.sample).toHaveBeenCalledTimes(1)
    expect(systemMetrics.sample).toHaveBeenCalledTimes(1)
  })

  it('samples queue depth and returns Prometheus text with the expected content type', async () => {
    const response = {
      type: jest.fn().mockReturnThis(),
      send: jest.fn()
    }
    const controller = new MetricsController({
      render: jest.fn().mockResolvedValue('# TYPE sample counter\n')
    } as never)

    await controller.metricsText(response as never)

    expect(response.type).toHaveBeenCalledWith('text/plain; version=0.0.4; charset=utf-8')
    expect(response.send).toHaveBeenCalledWith('# TYPE sample counter\n')
  })

  it('enforces x-api-key on the actual HTTP route while keeping valid Prometheus scrapes available', async () => {
    const module = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        MetricsApiKeyGuard,
        {
          provide: MetricsService,
          useValue: { render: jest.fn().mockResolvedValue('# TYPE sample counter\n') }
        }
      ]
    }).compile()
    const app = module.createNestApplication()
    await app.init()
    const httpServer = app.getHttpServer() as Parameters<typeof request>[0]

    try {
      await request(httpServer).get('/metrics').expect(401)
      await request(httpServer).get('/metrics').set('x-api-key', 'wrong-key').expect(401)
      const response = await request(httpServer).get('/metrics').set('x-api-key', envConfig.API_KEY).expect(200)

      expect(response.headers['content-type']).toContain('text/plain')
      expect(response.text).toBe('# TYPE sample counter\n')
    } finally {
      await app.close()
    }
  })
})
