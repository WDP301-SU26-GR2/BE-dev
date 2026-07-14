import type { RedisOptions } from 'ioredis'

export const REDIS_CLIENT = Symbol('REDIS_CLIENT')
export const REDIS_BULL_CONNECTION = Symbol('REDIS_BULL_CONNECTION')
export const REDIS_WS_CONNECTION = Symbol('REDIS_WS_CONNECTION')

// General request paths fail promptly rather than queuing through reconnects.
export const GENERAL_REDIS_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  commandTimeout: 1000,
  connectTimeout: 3000,
  lazyConnect: false
}

// BullMQ owns its retries, while WebSocket commands wait for reconnects.
export const BULL_REDIS_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
}

export const WS_REDIS_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: null,
  enableOfflineQueue: true,
  enableReadyCheck: false
}
