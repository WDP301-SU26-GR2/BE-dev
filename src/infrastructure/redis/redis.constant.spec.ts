import { MODULE_METADATA } from '@nestjs/common/constants'
import { Redis } from 'ioredis'
import envConfig from 'src/core/config/envConfig'
import {
  BULL_REDIS_OPTIONS,
  GENERAL_REDIS_OPTIONS,
  REDIS_BULL_CONNECTION,
  REDIS_CLIENT,
  REDIS_WS_CONNECTION,
  WS_REDIS_OPTIONS
} from './redis.constant'
import { RedisModule } from './redis.module'
import { RedisService } from './redis.service'

// Jest hoists this mock before RedisModule imports ioredis.
jest.mock('ioredis', () => ({ Redis: jest.fn() }))

describe('Redis connection options', () => {
  it('configures general Redis commands to fail quickly', () => {
    expect(GENERAL_REDIS_OPTIONS).toMatchObject({
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 1000,
      connectTimeout: 3000,
      lazyConnect: false
    })
    expect(GENERAL_REDIS_OPTIONS).not.toHaveProperty(['comment', 'Timeout'].join(''))
  })

  it('configures BullMQ to manage request retries', () => {
    expect(BULL_REDIS_OPTIONS).toMatchObject({
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    })
  })

  it('configures WebSocket Redis to buffer reconnecting commands', () => {
    expect(WS_REDIS_OPTIONS).toMatchObject({
      enableOfflineQueue: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    })
  })

  it('registers and exports all Redis client providers', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, RedisModule) as unknown[]
    const exports = Reflect.getMetadata(MODULE_METADATA.EXPORTS, RedisModule) as unknown[]
    const tokens = [REDIS_CLIENT, REDIS_BULL_CONNECTION, REDIS_WS_CONNECTION]

    expect(providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provide: REDIS_CLIENT }),
        expect.objectContaining({ provide: REDIS_BULL_CONNECTION }),
        expect.objectContaining({ provide: REDIS_WS_CONNECTION })
      ])
    )
    expect(exports).toEqual(expect.arrayContaining([RedisService, ...tokens]))

    for (const token of tokens) {
      expect(providers).toEqual(
        expect.arrayContaining([expect.objectContaining({ provide: token, useFactory: expect.any(Function) })])
      )
    }
  })

  it('creates each Redis client with its matching options', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, RedisModule) as Array<{
      provide: symbol
      useFactory: () => unknown
    }>
    const mockRedis = Redis as unknown as jest.Mock
    const tokens = [REDIS_CLIENT, REDIS_BULL_CONNECTION, REDIS_WS_CONNECTION]

    mockRedis.mockClear()

    for (const token of tokens) {
      const provider = providers.find((candidate) => candidate.provide === token)
      expect(provider).toEqual(expect.objectContaining({ provide: token, useFactory: expect.any(Function) }))
      if (!provider) throw new Error(`Missing Redis provider for ${String(token)}`)
      provider.useFactory()
    }

    expect(mockRedis).toHaveBeenCalledTimes(3)
    expect(mockRedis.mock.calls).toEqual([
      [envConfig.REDIS_URL, GENERAL_REDIS_OPTIONS],
      [envConfig.REDIS_URL, BULL_REDIS_OPTIONS],
      [envConfig.REDIS_URL, WS_REDIS_OPTIONS]
    ])
  })
})
