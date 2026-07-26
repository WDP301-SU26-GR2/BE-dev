import { RuntimeSystemMetricsService } from './runtime-system-metrics.service'

describe('RuntimeSystemMetricsService', () => {
  it('samples non-negative disk capacity and a stable process start time', () => {
    type SystemSample = { diskFreeBytes: number; processStartTimeSeconds: number }
    const metrics = { recordSystem: jest.fn<void, [SystemSample]>() }
    const service = new RuntimeSystemMetricsService(metrics as never)

    service.sample()
    service.sample()

    expect(metrics.recordSystem).toHaveBeenCalledTimes(2)
    const [first, second] = metrics.recordSystem.mock.calls.map(([sample]: [SystemSample]) => sample)
    expect(first.diskFreeBytes).toBeGreaterThan(0)
    expect(first.processStartTimeSeconds).toBeGreaterThan(0)
    expect(second.processStartTimeSeconds).toBe(first.processStartTimeSeconds)
  })
})
