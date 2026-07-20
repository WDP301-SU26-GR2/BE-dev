// Spec 23 — read-cache TTLs in seconds. Namespace is the unit of invalidation.
export const PUB_SERIES_TTL_SEC = 120
export const VOTE_CTX_TTL_SEC = 60
export const RANKING_IMMUTABLE_TTL_SEC = 3600
export const RANKING_SHARED_TTL_SEC = 600

export type CacheNamespace = 'pubseries' | 'votectx' | 'ranking'
