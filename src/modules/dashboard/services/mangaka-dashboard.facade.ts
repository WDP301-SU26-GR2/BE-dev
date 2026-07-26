import { Injectable } from '@nestjs/common'
import { MangakaDashboardService } from './mangaka-dashboard.service'
import { MangakaEarningsService } from './mangaka-earnings.service'

@Injectable()
export class MangakaDashboardFacade {
  constructor(
    private readonly dashboard: MangakaDashboardService,
    private readonly earningsService: MangakaEarningsService
  ) {}

  build(userId: string) {
    return this.dashboard.build(userId)
  }

  earnings(userId: string) {
    return this.earningsService.build(userId)
  }
}
