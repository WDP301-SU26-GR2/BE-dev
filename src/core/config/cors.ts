import envConfig from './envConfig'

export function parseCorsOrigins(raw: string): string | string[] {
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return origins.length === 0 ? '*' : origins
}

export function corsOrigins(): string | string[] {
  return parseCorsOrigins(envConfig.CORS_ORIGINS)
}
