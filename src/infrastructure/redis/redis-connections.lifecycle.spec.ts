import { RedisConnectionsLifecycle } from './redis-connections.lifecycle'

describe('RedisConnectionsLifecycle', () => {
  it('closes every distinct Redis connection during app shutdown', async () => {
    const general = { status: 'ready', quit: jest.fn().mockResolvedValue('OK'), disconnect: jest.fn() }
    const bull = { status: 'ready', quit: jest.fn().mockResolvedValue('OK'), disconnect: jest.fn() }
    const lifecycle = new RedisConnectionsLifecycle(general as never, bull as never, general as never)

    await lifecycle.onApplicationShutdown()

    expect(general.quit).toHaveBeenCalledTimes(1)
    expect(bull.quit).toHaveBeenCalledTimes(1)
  })

  it('falls back to an immediate disconnect when QUIT fails', async () => {
    const client = { status: 'ready', quit: jest.fn().mockRejectedValue(new Error('down')), disconnect: jest.fn() }
    const ended = { status: 'end', quit: jest.fn(), disconnect: jest.fn() }
    const lifecycle = new RedisConnectionsLifecycle(client as never, ended as never, ended as never)

    await lifecycle.onApplicationShutdown()

    expect(client.disconnect).toHaveBeenCalledTimes(1)
    expect(ended.quit).not.toHaveBeenCalled()
  })
})
