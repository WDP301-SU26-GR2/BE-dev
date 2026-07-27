import 'reflect-metadata'
import { PATH_METADATA } from '@nestjs/common/constants'
import { SurveyController } from './survey.controller'
import { PublicRankingController } from './public-ranking.controller'
import envConfig from 'src/core/config/envConfig'
import { GUARDS_METADATA } from '@nestjs/common/constants'
import { PublicRateLimitGuard } from 'src/core/security/guards/public-rate-limit.guard'

type Ctor = { prototype: Record<string, unknown> }

const handlerOf = (controller: Ctor, method: string) =>
  Object.getOwnPropertyDescriptor(controller.prototype, method)?.value as object

const handlerNames = (controller: Ctor) =>
  Object.getOwnPropertyNames(controller.prototype).filter((name) => name !== 'constructor')

// Một method trong controller mà KHÔNG có @Get/@Post/... thì Nest không map thành route:
// nó là code chết, nhưng vẫn "qua" mọi assertion decorator dạng Reflect.getMetadata.
// Guard này chặn đúng lớp bug đã xảy ra thật: 4 handler public bị nhân bản sang
// PublicRankingController nhưng bản gốc trong SurveyController không được xoá, khiến
// spec bảo mật bên dưới soi nhầm vào bản chết (gỡ @IsPublic khỏi route THẬT vẫn xanh).
describe.each([
  ['SurveyController', SurveyController as unknown as Ctor],
  ['PublicRankingController', PublicRankingController as unknown as Ctor]
])('%s has no dead handler', (_name, controller) => {
  it('every handler method is mapped to an HTTP route', () => {
    const dead = handlerNames(controller).filter(
      (method) => Reflect.getMetadata(PATH_METADATA, handlerOf(controller, method)) === undefined
    )
    expect(dead).toEqual([])
  })
})

describe('SurveyController public routes', () => {
  it('forwards optional open-period discovery filters to SurveyService', async () => {
    const surveyService = { getOpenPeriods: jest.fn().mockResolvedValue({ items: [] }) }
    const controller = new SurveyController(surveyService as never)

    await expect(
      controller.getOpenVotePeriods({ magazine: 'Shonen Jump', publicationType: 'WEEKLY' } as never)
    ).resolves.toEqual({
      items: []
    })
    expect(surveyService.getOpenPeriods).toHaveBeenCalledWith('Shonen Jump', 'WEEKLY')
  })

  it.each(['getVoteContext', 'getVoteLive', 'getOpenVotePeriods'])('%s route is @IsPublic', (method) => {
    const meta = Reflect.getMetadata(
      envConfig.AUTH_TYPE_KEY,
      handlerOf(SurveyController as unknown as Ctor, method)
    ) as { authType: string[] } | undefined
    expect(meta?.authType).toContain('None')
  })

  it('getOpenVotePeriods is protected by PublicRateLimitGuard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      handlerOf(SurveyController as unknown as Ctor, 'getOpenVotePeriods')
    ) as unknown[] | undefined
    expect(guards).toContain(PublicRateLimitGuard)
  })

  it.each(['getVoteLive', 'getOpenVotePeriods'])('%s clears the class-level bearer requirement', (method) => {
    const operation = Reflect.getMetadata(
      'swagger/apiOperation',
      handlerOf(SurveyController as unknown as Ctor, method)
    ) as { security?: unknown[] } | undefined
    expect(operation?.security).toEqual([])
  })
})

// Các route ranking public THẬT nằm ở PublicRankingController (SurveyController từng có bản
// nhân bản không @Get — đã xoá). Assert bảo mật phải soi đúng controller đang phục vụ route,
// nếu không sẽ là bảo đảm giả.
describe('PublicRankingController public routes', () => {
  const methods = ['getLatestVoteResults', 'getVotePeriods', 'getVoteResults', 'getRankingAggregate']

  it.each(methods)('%s route is @IsPublic', (method) => {
    const meta = Reflect.getMetadata(
      envConfig.AUTH_TYPE_KEY,
      handlerOf(PublicRankingController as unknown as Ctor, method)
    ) as { authType: string[] } | undefined
    expect(meta?.authType).toContain('None')
  })

  it.each(['getLatestVoteResults', 'getVotePeriods'])('%s is protected by PublicRateLimitGuard', (method) => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      handlerOf(PublicRankingController as unknown as Ctor, method)
    ) as unknown[] | undefined
    expect(guards).toContain(PublicRateLimitGuard)
  })

  it.each(['getLatestVoteResults', 'getVotePeriods', 'getRankingAggregate'])(
    '%s clears the class-level bearer requirement',
    (method) => {
      const operation = Reflect.getMetadata(
        'swagger/apiOperation',
        handlerOf(PublicRankingController as unknown as Ctor, method)
      ) as { security?: unknown[] } | undefined
      expect(operation?.security).toEqual([])
    }
  )
})
