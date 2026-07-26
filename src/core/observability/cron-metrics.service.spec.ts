import { CronMetricsService, runCron } from './cron-metrics.service'

describe('CronMetricsService', () => {
  const create = () => {
    const metrics = {
      recordCron: jest.fn()
    }
    return { service: new CronMetricsService(metrics as never), metrics }
  }

  it('records a successful run and returns the task result', async () => {
    const { service, metrics } = create()

    await expect(service.run('deadline-warning', () => Promise.resolve('done'))).resolves.toBe('done')

    expect(metrics.recordCron).toHaveBeenCalledWith({
      job: 'deadline-warning',
      outcome: 'success',
      durationSeconds: expect.any(Number)
    })
    expect(metrics.recordCron.mock.calls[0][0].durationSeconds).toBeGreaterThanOrEqual(0)
  })

  it('records a failed run and rethrows the original error', async () => {
    const { service, metrics } = create()
    const failure = new Error('database unavailable')

    await expect(service.run('deadline-warning', () => Promise.reject(failure))).rejects.toBe(failure)

    expect(metrics.recordCron).toHaveBeenCalledWith({
      job: 'deadline-warning',
      outcome: 'failure',
      durationSeconds: expect.any(Number)
    })
  })

  it('does not let metrics collection change task semantics', async () => {
    const metrics = {
      recordCron: jest.fn(() => {
        throw new Error('metrics unavailable')
      })
    }
    const service = new CronMetricsService(metrics as never)

    await expect(service.run('otp-cleanup', () => Promise.resolve(42))).resolves.toBe(42)
  })

  it('runs a task when a manually constructed scheduler has no metrics dependency', async () => {
    await expect(runCron(undefined, 'otp-cleanup', () => Promise.resolve(42))).resolves.toBe(42)
  })
})
