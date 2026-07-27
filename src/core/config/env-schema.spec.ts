import { parseEnvironment } from './env-schema'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const productionEnv = {
  NODE_ENV: 'production',
  PORT: '4000',
  SALT_OR_ROUNDS: '10',
  NAME_APP: 'Mangaka',
  API_KEY: 'a'.repeat(32),
  AUTH_TYPE_KEY: 'authType',
  DATABASE_URL: 'mongodb://mongo:27017/mangaka?replicaSet=rs0',
  REDIS_URL: 'redis://redis:6379',
  ACCESS_TOKEN_SECRET: 'b'.repeat(32),
  REFRESH_TOKEN_SECRET: 'c'.repeat(32),
  ACCESS_TOKEN_EXPIRES_IN: '1h',
  REFRESH_TOKEN_EXPIRES_IN: '7d',
  ADMIN_NAME: 'Admin',
  ADMIN_PASSWORD: 'd'.repeat(16),
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PHONE: '+84900000000',
  OTP_EXPIRES_IN: '5m',
  RESEND_API_KEY: 're_test',
  GOOGLE_CLIENT_ID: 'google',
  R2_ENDPOINT: 'https://r2.example.com',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'bucket',
  R2_REGION: 'auto',
  CORS_ORIGINS: 'https://app.example.com',
  IDENTITY_HASH_PEPPER: 'e'.repeat(32),
  RECAPTCHA_SECRET: 'f'.repeat(32)
}

describe('production environment schema', () => {
  it('accepts a strong production configuration', () => {
    expect(parseEnvironment(productionEnv).NODE_ENV).toBe('production')
  })

  it.each([
    ['ACCESS_TOKEN_SECRET', 'change-me'],
    ['REFRESH_TOKEN_SECRET', 'test-secret'],
    ['API_KEY', 'short'],
    ['IDENTITY_HASH_PEPPER', 'example-pepper'],
    ['RECAPTCHA_SECRET', ''],
    ['CORS_ORIGINS', '*'],
    ['CORS_ORIGINS', 'http://app.example.com'],
    ['DATABASE_URL', 'https://mongo.example.com'],
    ['REDIS_URL', 'https://redis.example.com']
  ])('rejects unsafe production %s', (key, value) => {
    expect(() => parseEnvironment({ ...productionEnv, [key]: value })).toThrow(key)
  })

  it('allows only explicit HTTP localhost origins when the production escape hatch is enabled', () => {
    expect(
      parseEnvironment({
        ...productionEnv,
        ALLOW_INSECURE_LOCAL_CORS: 'true',
        CORS_ORIGINS: 'https://app.example.com,http://localhost:5173,http://127.0.0.1:3000'
      }).ALLOW_INSECURE_LOCAL_CORS
    ).toBe(true)

    expect(() =>
      parseEnvironment({
        ...productionEnv,
        ALLOW_INSECURE_LOCAL_CORS: 'true',
        CORS_ORIGINS: 'http://192.168.1.8:5173'
      })
    ).toThrow('CORS_ORIGINS')
  })

  it('requires a strong AI key only when the optional AI URL is enabled', () => {
    expect(() =>
      parseEnvironment({
        ...productionEnv,
        AI_SERVICE_URL: 'https://ai.example.com',
        AI_SERVICE_API_KEY: 'short'
      })
    ).toThrow('AI_SERVICE_API_KEY')

    expect(
      parseEnvironment({
        ...productionEnv,
        AI_SERVICE_URL: '',
        AI_SERVICE_API_KEY: ''
      }).AI_SERVICE_URL
    ).toBe('')
  })

  it('keeps safe defaults available in test', () => {
    const result = parseEnvironment({
      ...productionEnv,
      NODE_ENV: 'test',
      ACCESS_TOKEN_SECRET: 'test',
      REFRESH_TOKEN_SECRET: 'test',
      API_KEY: 'test',
      IDENTITY_HASH_PEPPER: '',
      RECAPTCHA_SECRET: '',
      CORS_ORIGINS: ''
    })
    expect(result.NODE_ENV).toBe('test')
  })

  it('terminates a real process before bootstrap when production configuration is unsafe', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-r',
        'tsconfig-paths/register',
        '-e',
        "require('./src/core/config/envConfig').default"
      ],
      {
        cwd: resolve(__dirname, '../../..'),
        env: { ...process.env, ...productionEnv, ACCESS_TOKEN_SECRET: 'change-me' },
        encoding: 'utf8'
      }
    )

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain('ACCESS_TOKEN_SECRET')
    expect(`${result.stdout}${result.stderr}`).not.toContain(productionEnv.DATABASE_URL)
  })
})
