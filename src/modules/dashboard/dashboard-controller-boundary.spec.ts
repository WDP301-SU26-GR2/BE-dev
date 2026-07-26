import { METHOD_METADATA, PARAMTYPES_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { RequestMethod } from '@nestjs/common'
import { ROLES_KEY } from 'src/core/security/decorators/roles.decorator'
import { AdminDashboardController } from './admin-dashboard.controller'
import { AssistantDashboardController } from './assistant-dashboard.controller'
import { BoardDashboardController } from './board-dashboard.controller'
import { EditorDashboardController } from './editor-dashboard.controller'
import { MangakaDashboardController } from './mangaka-dashboard.controller'

type ControllerClass = abstract new (...args: never[]) => object

describe('Dashboard audience controller boundaries', () => {
  const cases: Array<[ControllerClass, string, string, string]> = [
    [MangakaDashboardController, 'mangaka', 'mangaka', 'MANGAKA'],
    [MangakaDashboardController, 'earnings', 'mangaka/earnings', 'MANGAKA'],
    [AssistantDashboardController, 'assistant', 'assistant', 'ASSISTANT'],
    [EditorDashboardController, 'editor', 'editor', 'EDITOR'],
    [BoardDashboardController, 'board', 'board', 'BOARD_MEMBER'],
    [AdminDashboardController, 'admin', 'admin', 'SUPER_ADMIN']
  ]

  it.each(cases)('%p.%s preserves GET dashboard/%s', (controller, methodName, path, role) => {
    const prototype = controller.prototype as Record<string, object>
    const handler = prototype[methodName]
    expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe('dashboard')
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path)
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET)
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([role])
    expect(Reflect.getMetadataKeys(handler).some((key) => String(key).includes('swagger'))).toBe(true)
  })

  it.each([
    MangakaDashboardController,
    AssistantDashboardController,
    EditorDashboardController,
    BoardDashboardController,
    AdminDashboardController
  ])('%p injects exactly one audience facade', (controller) => {
    expect(Reflect.getMetadata(PARAMTYPES_METADATA, controller)).toHaveLength(1)
  })

  it('delegates each audience route to its single facade', async () => {
    const mangaka = { build: jest.fn(), earnings: jest.fn() }
    const assistant = { build: jest.fn() }
    const editor = { build: jest.fn() }
    const board = { build: jest.fn() }
    const admin = { build: jest.fn() }

    await new MangakaDashboardController(mangaka as never).mangaka('m1')
    await new MangakaDashboardController(mangaka as never).earnings('m1')
    await new AssistantDashboardController(assistant as never).assistant('a1')
    await new EditorDashboardController(editor as never).editor('e1')
    await new BoardDashboardController(board as never).board('b1')
    await new AdminDashboardController(admin as never).admin('sa1')

    expect(mangaka.build).toHaveBeenCalledWith('m1')
    expect(mangaka.earnings).toHaveBeenCalledWith('m1')
    expect(assistant.build).toHaveBeenCalledWith('a1')
    expect(editor.build).toHaveBeenCalledWith('e1')
    expect(board.build).toHaveBeenCalledWith('b1')
    expect(admin.build).toHaveBeenCalledWith('sa1')
  })
})
