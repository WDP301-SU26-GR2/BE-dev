import envConfig from './envConfig'

export function parseCorsOrigins(raw: string): string | string[] {
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    // Browser `Origin` header is scheme://host[:port] with NO trailing slash/path, and CORS matching
    // is exact — so strip a configured trailing slash to avoid silent mismatches.
    .map((origin) => origin.replace(/\/+$/, ''))
    .filter(Boolean)

  return origins.length === 0 ? '*' : origins
}

export function corsOrigins(): string | string[] {
  return parseCorsOrigins(envConfig.CORS_ORIGINS)
}
