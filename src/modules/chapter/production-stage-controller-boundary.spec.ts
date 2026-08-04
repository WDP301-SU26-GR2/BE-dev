import { METHOD_METADATA, PARAMTYPES_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { RequestMethod } from '@nestjs/common'
import { ProductionStageController } from './production-stage.controller'

describe('ProductionStageController boundary', () => {
  it.each([
    ['list', 'chapters/:id/stages', RequestMethod.GET],
    ['complete', 'chapters/:id/stages/:stageId/complete', RequestMethod.POST],
    ['patch', 'chapters/:id/stages/:stageId', RequestMethod.PATCH],
    ['add', 'chapters/:id/stages', RequestMethod.POST],
    ['remove', 'chapters/:id/stages/:stageId', RequestMethod.DELETE],
    ['listPages', 'chapters/:id/stages/:stageId/pages', RequestMethod.GET],
    ['confirmOutputs', 'chapters/:id/stages/:stageId/outputs', RequestMethod.PUT]
  ])('%s preserves %s route metadata', (methodName, path, method) => {
    const handler = (ProductionStageController.prototype as Record<string, unknown>)[methodName]
    expect(Reflect.getMetadata(PATH_METADATA, ProductionStageController)).toBe('/')
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path)
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method)
    expect(Reflect.getMetadataKeys(handler).some((key) => String(key).includes('swagger'))).toBe(true)
  })

  it('injects exactly one production-stage facade', () => {
    expect(Reflect.getMetadata(PARAMTYPES_METADATA, ProductionStageController)).toHaveLength(1)
  })

  it('delegates every route to the facade without changing actor context', async () => {
    const facade = {
      list: jest.fn(),
      complete: jest.fn(),
      patch: jest.fn(),
      add: jest.fn(),
      remove: jest.fn(),
      listPages: jest.fn(),
      confirmOutputs: jest.fn()
    }
    const controller = new ProductionStageController(facade as never)
    const user = { userId: 'm1', roleName: 'MANGAKA' } as never
    const update = { name: 'Ink' } as never
    const create = { name: 'Custom' } as never
    const outputs = { pages: [] } as never

    await controller.list(user, 'c1')
    await controller.complete(user, 'c1', 's1')
    await controller.patch(user, 'c1', 's1', update)
    await controller.add(user, 'c1', create)
    await controller.remove(user, 'c1', 's1')
    await controller.listPages(user, 'c1', 's1')
    await controller.confirmOutputs(user, 'c1', 's1', outputs)

    expect(facade.list).toHaveBeenCalledWith(user, 'c1')
    expect(facade.complete).toHaveBeenCalledWith(user, 'c1', 's1')
    expect(facade.patch).toHaveBeenCalledWith(user, 'c1', 's1', update)
    expect(facade.add).toHaveBeenCalledWith(user, 'c1', create)
    expect(facade.remove).toHaveBeenCalledWith(user, 'c1', 's1')
    expect(facade.listPages).toHaveBeenCalledWith(user, 'c1', 's1')
    expect(facade.confirmOutputs).toHaveBeenCalledWith(user, 'c1', 's1', outputs)
  })
})
