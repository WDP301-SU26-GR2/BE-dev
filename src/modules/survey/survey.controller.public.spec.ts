import 'reflect-metadata'
import { SurveyController } from './survey.controller'
import envConfig from 'src/core/config/envConfig'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { PublicRateLimitGuard } from 'src/core/security/guards/public-rate-limit.guard'

describe('SurveyController public routes', () => {
  it.each(['getVoteContext', 'getVoteResults', 'getLatestVoteResults', 'getVotePeriods'])(
    '%s route is @IsPublic',
    (method) => {
      const handler = Object.getOwnPropertyDescriptor(SurveyController.prototype, method)?.value as object
      const meta = Reflect.getMetadata(envConfig.AUTH_TYPE_KEY, handler) as { authType: string[] } | undefined
      expect(meta?.authType).toContain('None')
    }
  )

  it.each(['getLatestVoteResults', 'getVotePeriods'])('%s is protected by PublicRateLimitGuard', (method) => {
    const handler = Object.getOwnPropertyDescriptor(SurveyController.prototype, method)?.value as object
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined
    expect(guards).toContain(PublicRateLimitGuard)
  })

  it.each(['getLatestVoteResults', 'getVotePeriods'])('%s clears the class-level bearer requirement', (method) => {
    const handler = Object.getOwnPropertyDescriptor(SurveyController.prototype, method)?.value as object
    const operation = Reflect.getMetadata('swagger/apiOperation', handler) as { security?: unknown[] } | undefined
    expect(operation?.security).toEqual([])
  })
})
