import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { TankobonMessages } from '../tankobon.messages'

const E = TankobonMessages.error

export const TankobonSeriesNotFoundException = new NotFoundException([{ message: E.seriesNotFound, path: 'seriesId' }])
export const DefenseDashboardAccessDeniedException = new ForbiddenException([
  { message: E.dashboardAccessDenied, path: 'seriesId' }
])
