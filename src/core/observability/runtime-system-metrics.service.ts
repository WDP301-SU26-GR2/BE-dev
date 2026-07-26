import { Injectable } from '@nestjs/common'
import { statfsSync } from 'node:fs'
import { RuntimeMetricsService } from './runtime-metrics.service'

@Injectable()
export class RuntimeSystemMetricsService {
  private readonly processStartTimeSeconds = Math.floor(Date.now() / 1000 - process.uptime())

  constructor(private readonly metrics: RuntimeMetricsService) {}

  sample(): void {
    const filesystem = statfsSync(process.cwd())
    this.metrics.recordSystem({
      diskFreeBytes: Number(filesystem.bavail) * Number(filesystem.bsize),
      processStartTimeSeconds: this.processStartTimeSeconds
    })
  }
}
