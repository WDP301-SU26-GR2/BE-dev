import envConfig from './envConfig'

export function parseCorsOrigins(
  raw: string,
  nodeEnv: 'development' | 'test' | 'production' = envConfig.NODE_ENV,
  allowInsecureLocalCors = envConfig.ALLOW_INSECURE_LOCAL_CORS
): string | string[] {
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    // Browser `Origin` header is scheme://host[:port] with NO trailing slash/path, and CORS matching
    // is exact — so strip a configured trailing slash to avoid silent mismatches.
    .map((origin) => origin.replace(/\/+$/, ''))
    .filter(Boolean)

  if (nodeEnv === 'production') {
    const isAllowedInsecureLocalOrigin = (origin: string) =>
      allowInsecureLocalCors && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    if (
      origins.length === 0 ||
      origins.includes('*') ||
      origins.some((origin) => !origin.startsWith('https://') && !isAllowedInsecureLocalOrigin(origin))
    ) {
      throw new Error('CORS_ORIGINS must be a non-empty HTTPS allow-list in production')
    }
  }

  return origins.length === 0 ? '*' : origins
}

export function corsOrigins(): string | string[] {
  return parseCorsOrigins(envConfig.CORS_ORIGINS)
}
