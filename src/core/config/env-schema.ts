import z from 'zod'

const positiveInt = (defaultValue: number, max: number) =>
  z.coerce.number().int().positive().max(max).default(defaultValue)

const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535),
    SALT_OR_ROUNDS: z.coerce.number().int().min(4).max(31),
    NAME_APP: z.string().min(1),
    API_KEY: z.string(),
    AUTH_TYPE_KEY: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    ACCESS_TOKEN_SECRET: z.string(),
    REFRESH_TOKEN_SECRET: z.string(),
    ACCESS_TOKEN_EXPIRES_IN: z.string().min(1),
    REFRESH_TOKEN_EXPIRES_IN: z.string().min(1),
    ADMIN_NAME: z.string().min(1),
    ADMIN_PASSWORD: z.string().min(1),
    ADMIN_EMAIL: z.string().email(),
    ADMIN_PHONE: z.string().min(1),
    OTP_EXPIRES_IN: z.string().min(1),
    RESEND_API_KEY: z.string(),
    EMAIL_FROM: z.string().default('Mangaka <ecom@novaproj.site>'),
    EMAIL_LOGO_URL: z.string().default(''),
    GOOGLE_CLIENT_ID: z.string(),
    R2_ENDPOINT: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET: z.string().min(1),
    R2_REGION: z.string().min(1),
    OTP_RL_EMAIL_MAX: positiveInt(10, 1_000_000),
    OTP_RL_EMAIL_WINDOW: positiveInt(3600, 31_536_000),
    OTP_RL_IP_MAX: positiveInt(50, 1_000_000),
    OTP_RL_IP_WINDOW: positiveInt(3600, 31_536_000),
    OTP_RL_COOLDOWN: positiveInt(30, 86_400),
    DEADLINE_WARN_THRESHOLD_HOURS: positiveInt(48, 8760),
    DEADLINE_SLOT_GRACE_HOURS: positiveInt(48, 8760),
    NAME_MAX_REVIEW_ROUNDS: positiveInt(8, 100),
    ORPHAN_ASSET_TTL_HOURS: positiveInt(24, 8760),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(20).default(1),
    CORS_ORIGINS: z.string().default(''),
    IDENTITY_HASH_PEPPER: z.string().default(''),
    AI_SERVICE_URL: z.string().default(''),
    AI_SERVICE_API_KEY: z.string().default(''),
    AI_HTTP_TIMEOUT_MS: positiveInt(120000, 600_000),
    RECAPTCHA_SECRET: z.string().default(''),
    PUBLIC_SIGN_TTL_SECONDS: positiveInt(900, 86_400),
    READ_CACHE_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    PUBLIC_RL_IP_MAX: positiveInt(120, 1_000_000),
    PUBLIC_RL_IP_WINDOW: positiveInt(60, 86_400)
  })
  .superRefine((environment, context) => {
    const issue = (path: keyof typeof environment, message: string) =>
      context.addIssue({ code: 'custom', path: [path], message })
    const hasProtocol = (value: string, protocols: string[]) => {
      try {
        return protocols.includes(new URL(value).protocol)
      } catch {
        return false
      }
    }

    if (environment.AI_SERVICE_URL !== '' && environment.AI_SERVICE_API_KEY === '') {
      issue('AI_SERVICE_API_KEY', 'is required when AI_SERVICE_URL is enabled')
    }
    if (environment.NODE_ENV !== 'production') return

    const isStrongSecret = (value: string, minLength = 32) =>
      value.length >= minLength && !/(change-me|example|test)/i.test(value)
    for (const key of [
      'ACCESS_TOKEN_SECRET',
      'REFRESH_TOKEN_SECRET',
      'API_KEY',
      'IDENTITY_HASH_PEPPER',
      'RECAPTCHA_SECRET'
    ] as const) {
      if (!isStrongSecret(environment[key])) issue(key, 'must be a strong non-placeholder secret of at least 32 bytes')
    }
    if (environment.AI_SERVICE_URL !== '' && !isStrongSecret(environment.AI_SERVICE_API_KEY)) {
      issue('AI_SERVICE_API_KEY', 'must be a strong non-placeholder secret of at least 32 bytes')
    }

    if (!hasProtocol(environment.DATABASE_URL, ['mongodb:', 'mongodb+srv:'])) {
      issue('DATABASE_URL', 'must use mongodb:// or mongodb+srv://')
    }
    if (!hasProtocol(environment.REDIS_URL, ['redis:', 'rediss:'])) {
      issue('REDIS_URL', 'must use redis:// or rediss://')
    }
    if (!hasProtocol(environment.R2_ENDPOINT, ['https:'])) {
      issue('R2_ENDPOINT', 'must use https:// in production')
    }
    if (environment.AI_SERVICE_URL !== '' && !hasProtocol(environment.AI_SERVICE_URL, ['http:', 'https:'])) {
      issue('AI_SERVICE_URL', 'must use http:// or https://')
    }

    const origins = environment.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
    if (origins.length === 0 || origins.includes('*') || origins.some((origin) => !hasProtocol(origin, ['https:']))) {
      issue('CORS_ORIGINS', 'must be a non-empty HTTPS allow-list without wildcard')
    }
  })

export type Environment = z.infer<typeof EnvironmentSchema>

export function parseEnvironment(input: NodeJS.ProcessEnv | Record<string, string | undefined>): Environment {
  const parsed = EnvironmentSchema.safeParse(input)
  if (parsed.success) return parsed.data
  const message = parsed.error.issues
    .map((item) => `${item.path.join('.') || 'environment'}: ${item.message}`)
    .join('; ')
  throw new Error(`Invalid environment configuration: ${message}`)
}
