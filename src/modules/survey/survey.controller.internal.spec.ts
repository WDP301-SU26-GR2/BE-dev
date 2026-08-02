import 'reflect-metadata'
import { PATH_METADATA } from '@nestjs/common/constants'
import { RoleName } from 'src/core/security/constants/role.constant'
import envConfig from 'src/core/config/envConfig'
import { ROLES_KEY } from 'src/core/security/decorators/roles.decorator'
import { SurveyController } from './survey.controller'

const handlerOf = (method: string) =>
  Object.getOwnPropertyDescriptor(SurveyController.prototype, method)?.value as object

describe('SurveyController W1 internal read routes', () => {
  const internalReadRoles = [RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN]

  it('exposes a distinct authenticated aggregate route with all internal read roles', async () => {
    const surveyService = { getInternalRankingAggregate: jest.fn().mockResolvedValue({ items: [] }) }
    const controller = new SurveyController(surveyService as never)
    const query = { magazine: 'Jump', publicationType: 'WEEKLY', level: 'YEAR', year: 2026 } as const

    await controller.getInternalRankingAggregate(query)

    expect(Reflect.getMetadata(PATH_METADATA, handlerOf('getInternalRankingAggregate'))).toBe(
      'rankings/internal/aggregate'
    )
    expect(Reflect.getMetadata(ROLES_KEY, handlerOf('getInternalRankingAggregate'))).toEqual(internalReadRoles)
    expect(Reflect.getMetadata(envConfig.AUTH_TYPE_KEY, handlerOf('getInternalRankingAggregate'))).toBeUndefined()
    expect(surveyService.getInternalRankingAggregate).toHaveBeenCalledWith(query)
  })

  it('lets Mangaka discover period ids through the filtered listing only', async () => {
    const surveyService = {
      getSurveyPeriods: jest.fn().mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 })
    }
    const controller = new SurveyController(surveyService as never)
    const query = { magazine: 'Jump', publicationType: 'WEEKLY', status: 'OPEN', limit: 20, offset: 0 } as const

    await controller.getSurveyPeriods(query)

    expect(Reflect.getMetadata(ROLES_KEY, handlerOf('getSurveyPeriods'))).toEqual(internalReadRoles)
    expect(surveyService.getSurveyPeriods).toHaveBeenCalledWith(query)
  })

  it.each(['getSurveyPeriodById', 'getSurveyPeriodVotes', 'getSurveyPeriodSurveyData', 'getRankingRecords'])(
    'does not expand Mangaka access to %s',
    (method) => {
      expect(Reflect.getMetadata(ROLES_KEY, handlerOf(method))).toEqual([
        RoleName.EDITOR,
        RoleName.SUPER_ADMIN,
        RoleName.BOARD_MEMBER
      ])
    }
  )

  it.each(['createSurveyPeriod', 'updateSurveyPeriodStatus', 'importSurveyData', 'finalizeRanking'])(
    'keeps %s restricted to Super Admin',
    (method) => {
      expect(Reflect.getMetadata(ROLES_KEY, handlerOf(method))).toEqual([RoleName.SUPER_ADMIN])
    }
  )
})
