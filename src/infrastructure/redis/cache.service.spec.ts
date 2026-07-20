jest.mock('src/core/config/envConfig', () => ({
  __esModule: true,
  default: { READ_CACHE_ENABLED: true }
}))

import envConfig from 'src/core/config/envConfig'
import { CacheService } from './cache.service'

const makeClient = () => ({ get: jest.fn(), set: jest.fn(), incr: jest.fn() })

describe('CacheService (Spec 23)', () => {
  beforeEach(() => {
    ;(envConfig as { READ_CACHE_ENABLED: boolean }).READ_CACHE_ENABLED = true
  })

  it('miss loads and stores using the current namespace version', async () => {
    const client = makeClient()
    client.get.mockImplementation((key: string) => (key === 'cache:ver:ranking' ? '3' : null))
    const loader = jest.fn().mockResolvedValue({ a: 1 })

    await expect(
      new CacheService(client as never).getOrSet('ranking', 'results:p1:ALL', 3600, loader)
    ).resolves.toEqual({ a: 1 })
    expect(client.set).toHaveBeenCalledWith('cache:ranking:v3:results:p1:ALL', JSON.stringify({ a: 1 }), 'EX', 3600)
  })

  it('returns a hit without calling the loader', async () => {
    const client = makeClient()
    client.get.mockImplementation((key: string) => (key === 'cache:ver:ranking' ? '3' : JSON.stringify({ a: 2 })))
    const loader = jest.fn()

    await expect(new CacheService(client as never).getOrSet('ranking', 'x', 60, loader)).resolves.toEqual({ a: 2 })
    expect(loader).not.toHaveBeenCalled()
  })

  it('uses version zero when no version has been created', async () => {
    const client = makeClient()
    client.get.mockResolvedValue(null)

    await new CacheService(client as never).getOrSet('pubseries', 'k', 60, jest.fn().mockResolvedValue('v'))
    expect(client.set).toHaveBeenCalledWith('cache:pubseries:v0:k', JSON.stringify('v'), 'EX', 60)
  })

  it('fails open for Redis GET and SET failures without poisoning loader errors', async () => {
    const getFailure = makeClient()
    getFailure.get.mockRejectedValue(new Error('down'))
    await expect(
      new CacheService(getFailure as never).getOrSet('ranking', 'x', 60, jest.fn().mockResolvedValue(7))
    ).resolves.toBe(7)

    const setFailure = makeClient()
    setFailure.get.mockImplementation((key: string) => (key.startsWith('cache:ver:') ? '1' : null))
    setFailure.set.mockRejectedValue(new Error('down'))
    await expect(
      new CacheService(setFailure as never).getOrSet('ranking', 'x', 60, jest.fn().mockResolvedValue(9))
    ).resolves.toBe(9)

    const loaderFailure = makeClient()
    loaderFailure.get.mockResolvedValue(null)
    await expect(
      new CacheService(loaderFailure as never).getOrSet(
        'ranking',
        'x',
        60,
        jest.fn().mockRejectedValue(new Error('boom'))
      )
    ).rejects.toThrow('boom')
    expect(loaderFailure.set).not.toHaveBeenCalled()
  })

  it('bypasses cache when disabled and swallows bump failures', async () => {
    ;(envConfig as { READ_CACHE_ENABLED: boolean }).READ_CACHE_ENABLED = false
    const client = makeClient()
    await expect(
      new CacheService(client as never).getOrSet('ranking', 'x', 60, jest.fn().mockResolvedValue(1))
    ).resolves.toBe(1)
    expect(client.get).not.toHaveBeenCalled()
    ;(envConfig as { READ_CACHE_ENABLED: boolean }).READ_CACHE_ENABLED = true
    client.incr.mockRejectedValue(new Error('down'))
    await expect(new CacheService(client as never).bumpVersion('pubseries')).resolves.toBeUndefined()
    expect(client.incr).toHaveBeenCalledWith('cache:ver:pubseries')
  })
})
