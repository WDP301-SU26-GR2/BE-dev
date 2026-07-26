import { MetricsController } from './metrics.controller'
import { MetricsService } from './metrics.service'

describe('Metrics endpoint', () => {
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
})
