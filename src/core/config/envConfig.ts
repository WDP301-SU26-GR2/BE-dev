import { config } from 'dotenv'
import fs from 'fs'
import path from 'path'
import z from 'zod'
config()
//Kiểm tra xem file .env có tồn tại hay không, nếu không tồn tại thì sẽ log ra thông báo và thoát chương trình
//Bỏ qua check khi chạy production (vd: trong container) — biến môi trường được nạp sẵn từ orchestrator.
if (process.env.NODE_ENV !== 'production' && !fs.existsSync(path.resolve('.env'))) {
  console.log('.env file not found')
  process.exit(1)
}
const configSchema = z
  .object({
    ////PORT
    PORT: z.coerce.number(),
    SALT_OR_ROUNDS: z.coerce.number(),
    NAME_APP: z.string(),
    API_KEY: z.string(),
    AUTH_TYPE_KEY: z.string(),
    ////DATABASE URL
    DATABASE_URL: z.string(),
    REDIS_URL: z.string(),
    ////JWT
    ACCESS_TOKEN_SECRET: z.string(),
    REFRESH_TOKEN_SECRET: z.string(),
    ACCESS_TOKEN_EXPIRES_IN: z.string(),
    REFRESH_TOKEN_EXPIRES_IN: z.string(),
    ////SEED DATA
    ADMIN_NAME: z.string(),
    ADMIN_PASSWORD: z.string(),
    ADMIN_EMAIL: z.string(),
    ADMIN_PHONE: z.string(),
    //OTP
    OTP_EXPIRES_IN: z.string(),
    RESEND_API_KEY: z.string(),
    // EMAIL: sender ("Name <addr@domain>") + logo URL shown inside emails (empty → text fallback)
    EMAIL_FROM: z.string().default('Mangaka <ecom@novaproj.site>'),
    EMAIL_LOGO_URL: z.string().default(''),
    //GOOGLE OAUTH
    GOOGLE_CLIENT_ID: z.string(),
    ////OBJECT STORAGE (Cloudflare R2 - S3-compatible)
    R2_ENDPOINT: z.string(),
    R2_ACCESS_KEY_ID: z.string(),
    R2_SECRET_ACCESS_KEY: z.string(),
    R2_BUCKET: z.string(),
    R2_REGION: z.string(),
    ////REDIS / QUEUE / RATE-LIMIT (tunable — có default)
    // Spec 14 §4.3: nới quota + hạ cooldown. Rule email nay chỉ tiêu thụ khi OTP THẬT SỰ gửi
    // (AuthOtpService.issueOtp), rule IP vẫn tiêu thụ mọi request ở OtpRateLimitGuard.
    OTP_RL_EMAIL_MAX: z.coerce.number().default(10),
    OTP_RL_EMAIL_WINDOW: z.coerce.number().default(3600),
    OTP_RL_IP_MAX: z.coerce.number().default(50),
    OTP_RL_IP_WINDOW: z.coerce.number().default(3600),
    OTP_RL_COOLDOWN: z.coerce.number().default(30),
    DEADLINE_WARN_THRESHOLD_HOURS: z.coerce.number().default(48),
    DEADLINE_SLOT_GRACE_HOURS: z.coerce.number().default(48),
    NAME_MAX_REVIEW_ROUNDS: z.coerce.number().default(8),
    ORPHAN_ASSET_TTL_HOURS: z.coerce.number().default(24),
    TRUST_PROXY_HOPS: z.coerce.number().default(1),
    CORS_ORIGINS: z.string().default(''),
    // Guest identity/ip HMAC pepper (B-VOT-03 / NFR §1). Set a strong random secret in production;
    // empty default keeps dev/test booting but offers no leak-resistance — MUST override in prod.
    IDENTITY_HASH_PEPPER: z.string().default(''),
    ////AI SERVICE (Spec 2 - optional: empty = AI disabled)
    AI_SERVICE_URL: z.string().default(''),
    AI_SERVICE_API_KEY: z.string().default(''),
    AI_HTTP_TIMEOUT_MS: z.coerce.number().default(120000)
  })
  .refine((c) => c.AI_SERVICE_URL === '' || c.AI_SERVICE_API_KEY !== '', {
    message: 'AI_SERVICE_API_KEY is required when AI_SERVICE_URL is set'
  })

const congfigServer = configSchema.safeParse(process.env)
if (!congfigServer.success) {
  console.log('Invalid environment configuration:')
  console.error(congfigServer.error)
  process.exit(1)
}

const envConfig = congfigServer.data
export default envConfig
