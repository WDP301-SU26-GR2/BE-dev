import 'reflect-metadata'
import { SurveyController } from './survey.controller'
import envConfig from 'src/core/config/envConfig'

describe('SurveyController public routes (Fix-1 G-2)', () => {
  it.each(['getVoteContext', 'getVoteResults'])('%s route is @IsPublic', (method) => {
    const handler = Object.getOwnPropertyDescriptor(
      SurveyController.prototype,
      method as keyof SurveyController
    )?.value as object
    const meta = Reflect.getMetadata(envConfig.AUTH_TYPE_KEY, handler) as
      | { authType: string[] }
      | undefined
    expect(meta?.authType).toContain('None')
  })
})