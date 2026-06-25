import { config } from 'dotenv'
import fs from 'fs'
import path from 'path'
import z from 'zod'
config()
//Kiểm tra xem file .env có tồn tại hay không, nếu không tồn tại thì sẽ log ra thông báo và thoát chương trình
//Bỏ qua check khi chạy production (vd: trong container) — biến môi trường được nạp sẵn từ orchestrator.
if (process.env.NODE_ENV !== 'production' && !fs.existsSync(path.resolve('.env'))) {
  console.log('Ko tìm thấy file env')
  process.exit(1)
}
const configSchema = z.object({
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
  //GOOGLE OAUTH
  GOOGLE_CLIENT_ID: z.string(),
  ////OBJECT STORAGE (Cloudflare R2 - S3-compatible)
  R2_ENDPOINT: z.string(),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET: z.string(),
  R2_REGION: z.string()
})

const congfigServer = configSchema.safeParse(process.env)
if (!congfigServer.success) {
  console.log('Lỗi cấu hình env: ')
  console.error(congfigServer.error)
  process.exit(1)
}

const envConfig = congfigServer.data
export default envConfig
