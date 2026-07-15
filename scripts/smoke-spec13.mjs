// Local-only Spec 13 smoke: real API + MongoDB + Redis.
// Prerequisite: run the API on SMOKE_API (default http://localhost:4000) with MongoDB and Redis up.
import 'dotenv/config'

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'

const RAW_API = process.env.SMOKE_API ?? 'http://localhost:4000'
const DATABASE_URL = process.env.DATABASE_URL
const REDIS_URL = process.env.REDIS_URL
const REDIS_CONTAINER = process.env.SMOKE_REDIS_CONTAINER ?? 'redis-6696'
const REQUEST_TIMEOUT_MS = 1_000
const HEALTHY_REQUEST_MS = 100
const DOWN_REQUEST_MS = 500
const RECOVERY_DEADLINE_MS = 12_000
const OPERATION_TIMEOUT_MS = 3_000
const TAG = `s13-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
const TEST_PASSWORD = `S13!${randomBytes(18).toString('base64url')}9a`
const prisma = new PrismaClient()
const DOCKER_CONTAINER_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i

let API = RAW_API.replace(/\/+$/, '')
let pass = 0
let fail = 0
let xffSequence = 10
let runtime = null
let runtimeCloseInFlight = null
let restoreInFlight = null
let prismaDisconnected = false
let signalHandling = false
let redisPort = null
let redisStopAttempted = false

class HarnessError extends Error {}
class PhaseAbort extends HarnessError {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function withTimeout(promise, timeoutMs, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new HarnessError(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

function safeError(error) {
  if (error instanceof HarnessError) return error.message
  if (!error || typeof error !== 'object') return `type=${typeof error}`

  const name = typeof error.name === 'string' ? error.name : 'Error'
  const code = typeof error.code === 'string' ? ` code=${error.code}` : ''
  return `name=${name}${code}`
}

function check(name, condition, diagnostics = '') {
  const suffix = diagnostics ? ` | ${diagnostics}` : ''
  if (condition) {
    pass += 1
    console.log(`  PASS ${name}${suffix}`)
    return true
  }

  fail += 1
  console.error(`  FAIL ${name}${suffix}`)
  return false
}

function requireCheck(name, condition, diagnostics = '') {
  if (!check(name, condition, diagnostics)) throw new PhaseAbort(`${name} failed`)
}

function responseDiagnostics(response) {
  const status = response.status === null ? 'transport-error' : response.status
  const transport = response.transportError ? ` error=${response.transportError}` : ''
  return `status=${status} time=${response.ms}ms${transport}`
}

function normalizedHostname(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '')
}

function isLoopbackHostname(hostname) {
  return new Set(['localhost', '127.0.0.1', '::1']).has(normalizedHostname(hostname))
}

function requiredUrl(name, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HarnessError(`${name} is required`)
  }
  try {
    return new URL(value)
  } catch {
    throw new HarnessError(`${name} must be a valid URL`)
  }
}

function validateLocalHarness() {
  const parsed = requiredUrl('SMOKE_API', RAW_API)
  const database = requiredUrl('DATABASE_URL', DATABASE_URL)
  const redis = requiredUrl('REDIS_URL', REDIS_URL)

  if (!isLoopbackHostname(parsed.hostname)) throw new HarnessError('SMOKE_API must use a loopback hostname')
  if (parsed.username || parsed.password) throw new HarnessError('SMOKE_API must not contain credentials')
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new HarnessError('SMOKE_API must use HTTP or HTTPS')
  if ((parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) {
    throw new HarnessError('SMOKE_API must contain only the API origin')
  }
  if (!DOCKER_CONTAINER_RE.test(REDIS_CONTAINER)) {
    throw new HarnessError('SMOKE_REDIS_CONTAINER contains unsupported characters')
  }
  if (database.protocol === 'mongodb+srv:') throw new HarnessError('DATABASE_URL must not use mongodb+srv')
  if (database.protocol !== 'mongodb:') throw new HarnessError('DATABASE_URL must use mongodb')
  if (!isLoopbackHostname(database.hostname)) throw new HarnessError('DATABASE_URL must use a loopback hostname')

  let databaseName
  try {
    databaseName = decodeURIComponent(database.pathname.slice(1))
  } catch {
    throw new HarnessError('DATABASE_URL database name must be valid URL encoding')
  }
  const normalizedDatabaseName = databaseName.trim().toLowerCase()
  if (!normalizedDatabaseName || databaseName.includes('/')) {
    throw new HarnessError('DATABASE_URL must contain one nonempty database name')
  }
  if (new Set(['admin', 'local', 'config']).has(normalizedDatabaseName)) {
    throw new HarnessError('DATABASE_URL must not target a MongoDB system database')
  }

  if (!['redis:', 'rediss:'].includes(redis.protocol)) throw new HarnessError('REDIS_URL must use redis or rediss')
  if (!isLoopbackHostname(redis.hostname)) throw new HarnessError('REDIS_URL must use a loopback hostname')
  const effectiveRedisPort = redis.port === '' ? 6379 : Number(redis.port)
  if (!Number.isSafeInteger(effectiveRedisPort) || effectiveRedisPort < 1 || effectiveRedisPort > 65_535) {
    throw new HarnessError('REDIS_URL must contain a valid port')
  }

  API = parsed.origin
  redisPort = effectiveRedisPort
}

async function request(method, path, { body, token, origin, xff, headers, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const startedAt = performance.now()
  try {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(origin ? { origin } : {}),
        ...(xff ? { 'x-forwarded-for': xff } : {}),
        ...(headers ?? {})
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    })
    const raw = await response.text()
    let json = null
    try {
      json = raw === '' ? null : JSON.parse(raw)
    } catch {
      json = null
    }

    return {
      status: response.status,
      json,
      headers: response.headers,
      ms: Math.round(performance.now() - startedAt),
      transportError: null
    }
  } catch (error) {
    return {
      status: null,
      json: null,
      headers: null,
      ms: Math.round(performance.now() - startedAt),
      transportError: error && typeof error === 'object' && typeof error.name === 'string' ? error.name : 'Error'
    }
  }
}

function nextXff() {
  const octet = xffSequence
  xffSequence = xffSequence >= 240 ? 10 : xffSequence + 1
  return `198.51.100.${octet}`
}

function smokeEmail(label) {
  return `${TAG}-${label}@example.com`
}

function boundedInteger(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback
}

const RATE_BURST_CALLS = Math.min(
  100,
  Math.max(4, boundedInteger('OTP_RL_EMAIL_MAX', 5) + 1, boundedInteger('OTP_RL_IP_MAX', 20) + 1)
)

function otpCallForKey(key, timeoutMs = REQUEST_TIMEOUT_MS) {
  return request('POST', '/auth/send-otp-email', {
    xff: key.xff,
    timeoutMs,
    body: { email: key.email, purpose: 'FORGOT_PASSWORD' }
  })
}

function exactOtpRateLimit(response) {
  return (
    response.status === 429 &&
    response.json?.code === 'AUTH_OTP_RATE_LIMITED' &&
    typeof response.json?.retryAfter === 'number' &&
    Number.isFinite(response.json.retryAfter)
  )
}

async function driveKeyToRateLimit(key, deadlineMs) {
  const startedAt = performance.now()
  const calls = []
  while (calls.length < RATE_BURST_CALLS && performance.now() - startedAt < deadlineMs) {
    const remaining = deadlineMs - (performance.now() - startedAt)
    const response = await otpCallForKey(key, Math.max(50, Math.min(500, Math.floor(remaining))))
    calls.push(response)
    if (exactOtpRateLimit(response)) break
    if (response.transportError) break
  }
  return { calls, ms: Math.round(performance.now() - startedAt) }
}

function burstDiagnostics(calls) {
  return `calls=${calls.length} statuses=${calls.map((call) => call.status ?? 'transport-error').join(',')} times=${calls
    .map((call) => `${call.ms}ms`)
    .join(',')}`
}

function dockerAction(action) {
  if (!DOCKER_CONTAINER_RE.test(REDIS_CONTAINER)) {
    throw new HarnessError('SMOKE_REDIS_CONTAINER contains unsupported characters')
  }
  try {
    return execFileSync('docker', [action, REDIS_CONTAINER], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 12_000,
      windowsHide: true
    }).trim()
  } catch (error) {
    throw new HarnessError(`docker ${action} failed (${safeError(error)})`)
  }
}

function inspectRedisContainerBinding() {
  if (redisPort === null) throw new HarnessError('REDIS_URL has not been validated')

  let inspected
  try {
    const output = execFileSync('docker', ['inspect', REDIS_CONTAINER], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 2_000,
      windowsHide: true
    })
    inspected = JSON.parse(output)?.[0]
  } catch (error) {
    throw new HarnessError(`docker inspect failed (${safeError(error)})`)
  }

  if (inspected?.State?.Running !== true) {
    throw new HarnessError('SMOKE_REDIS_CONTAINER must be running before its binding is verified')
  }

  const ports = inspected?.NetworkSettings?.Ports
  if (!ports || typeof ports !== 'object') {
    throw new HarnessError('SMOKE_REDIS_CONTAINER has no inspectable published ports')
  }

  const containerPorts = [...new Set(['6379/tcp', `${redisPort}/tcp`])]
  const bindings = containerPorts.flatMap((containerPort) =>
    Array.isArray(ports[containerPort]) ? ports[containerPort] : []
  )
  const allowedHostIps = new Set(['', '0.0.0.0', '::', 'localhost', '127.0.0.1', '::1'])
  const matched = bindings.some(
    (binding) =>
      Number(binding?.HostPort) === redisPort &&
      allowedHostIps.has(normalizedHostname(String(binding?.HostIp ?? '')))
  )
  if (!matched) {
    throw new HarnessError(
      `SMOKE_REDIS_CONTAINER must publish Redis to local or wildcard host port ${redisPort}`
    )
  }

  return { containerPorts, bindingCount: bindings.length }
}

function stopBoundRedisContainer() {
  inspectRedisContainerBinding()
  redisStopAttempted = true
  return dockerAction('stop')
}

function dockerContainerRunning() {
  try {
    const output = execFileSync('docker', ['inspect', '--format', '{{.State.Running}}', REDIS_CONTAINER], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 2_000,
      windowsHide: true
    })
    return output.trim() === 'true'
  } catch {
    return null
  }
}

function dockerRedisPing() {
  try {
    const output = execFileSync('docker', ['exec', REDIS_CONTAINER, 'redis-cli', 'ping'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 2_000,
      windowsHide: true
    })
    return output.trim() === 'PONG'
  } catch {
    return false
  }
}

async function waitForCondition(label, predicate, timeoutMs, intervalMs) {
  const startedAt = performance.now()
  let attempts = 0
  while (performance.now() - startedAt < timeoutMs) {
    attempts += 1
    if (await predicate()) {
      return { attempts, ms: Math.round(performance.now() - startedAt) }
    }
    await sleep(intervalMs)
  }
  throw new HarnessError(`${label} timed out after ${Math.round(performance.now() - startedAt)}ms`)
}

function moduleExport(module, name) {
  const value = module?.[name] ?? module?.default?.[name]
  if (!value) throw new HarnessError(`Built module is missing export ${name}`)
  return value
}

async function closeRuntimeParts(moduleRef, redisClient, redisErrorListener, label) {
  const failures = []
  if (moduleRef) {
    try {
      await withTimeout(moduleRef.close(), 5_000, `${label} TestingModule close`)
    } catch (error) {
      failures.push(`module ${safeError(error)}`)
    }
  }
  if (redisClient) {
    try {
      await withTimeout(Promise.resolve().then(() => redisClient.disconnect(false)), 1_000, `${label} Redis disconnect`)
    } catch (error) {
      failures.push(`redis ${safeError(error)}`)
    } finally {
      if (redisErrorListener && redisClient.status === 'end') redisClient.off('error', redisErrorListener)
    }
  }
  if (failures.length > 0) throw new HarnessError(`${label} close failed (${failures.join('; ')})`)
}

async function ensureRuntimeContext() {
  if (runtime?.ready) return runtime
  if (runtime) await closeRuntimeContext()

  const [
    testingModule,
    ioredisModule,
    prismaModule,
    redisConstantModule,
    redisServiceModule,
    authModule,
    otpModule,
    notificationRepositoryModule,
    notificationModule
  ] = await Promise.all([
    import('@nestjs/testing'),
    import('ioredis'),
    import('../dist/infrastructure/database/prisma.service.js'),
    import('../dist/infrastructure/redis/redis.constant.js'),
    import('../dist/infrastructure/redis/redis.service.js'),
    import('../dist/modules/auth/auth.repo.js'),
    import('../dist/modules/auth/otp-cleanup.cron.js'),
    import('../dist/modules/notification/notification.repo.js'),
    import('../dist/modules/notification/notification.service.js')
  ])
  const Test = moduleExport(testingModule, 'Test')
  const Redis = moduleExport(ioredisModule, 'Redis')
  const PrismaService = moduleExport(prismaModule, 'PrismaService')
  const REDIS_CLIENT = moduleExport(redisConstantModule, 'REDIS_CLIENT')
  const GENERAL_REDIS_OPTIONS = moduleExport(redisConstantModule, 'GENERAL_REDIS_OPTIONS')
  const RedisService = moduleExport(redisServiceModule, 'RedisService')
  const AuthRepository = moduleExport(authModule, 'AuthRepository')
  const OtpCleanupCron = moduleExport(otpModule, 'OtpCleanupCron')
  const NotificationRepository = moduleExport(notificationRepositoryModule, 'NotificationRepository')
  const NotificationService = moduleExport(notificationModule, 'NotificationService')

  let moduleRef = null
  let redisClient = null
  const redisErrorListener = () => {}
  const compilePromise = Test.createTestingModule({
    providers: [
      { provide: PrismaService, useValue: prisma },
      {
        provide: REDIS_CLIENT,
        useFactory: () => {
          redisClient = new Redis(REDIS_URL, GENERAL_REDIS_OPTIONS)
          redisClient.on('error', redisErrorListener)
          return redisClient
        }
      },
      RedisService,
      AuthRepository,
      OtpCleanupCron,
      NotificationRepository,
      NotificationService
    ]
  }).compile()
  try {
    moduleRef = await withTimeout(compilePromise, 10_000, 'minimal Nest TestingModule compilation')
  } catch (error) {
    await closeRuntimeParts(null, redisClient, redisErrorListener, 'failed runtime').catch(() => {})
    void compilePromise
      .then(
        (lateModule) => closeRuntimeParts(lateModule, redisClient, redisErrorListener, 'late runtime'),
        () => closeRuntimeParts(null, redisClient, redisErrorListener, 'failed runtime')
      )
      .catch(() => {})
    throw error
  }

  runtime = {
    ready: false,
    moduleRef,
    redisClient,
    redisErrorListener,
    notificationService: null,
    otpCleanupCron: null
  }
  try {
    await withTimeout(moduleRef.init(), 10_000, 'minimal Nest TestingModule init')
    const resolved = {
      ready: true,
      moduleRef,
      redisClient,
      redisErrorListener,
      notificationService: moduleRef.get(NotificationService),
      otpCleanupCron: moduleRef.get(OtpCleanupCron)
    }
    runtime = resolved
    return runtime
  } catch (error) {
    try {
      await closeRuntimeContext()
    } catch (closeError) {
      throw new HarnessError(
        `minimal Nest TestingModule init failed (${safeError(error)}); cleanup failed (${safeError(closeError)})`
      )
    }
    throw error
  }
}

async function closeRuntimeContext() {
  if (runtimeCloseInFlight) return runtimeCloseInFlight
  if (!runtime) return
  const current = runtime
  runtimeCloseInFlight = closeRuntimeParts(
    current.moduleRef,
    current.redisClient,
    current.redisErrorListener,
    'Nest runtime'
  )
    .then(() => {
      if (runtime === current) runtime = null
    })
    .finally(() => {
      runtimeCloseInFlight = null
    })
  return runtimeCloseInFlight
}

async function disconnectPrisma() {
  if (prismaDisconnected) return
  await withTimeout(prisma.$disconnect(), 5_000, 'Prisma disconnect')
  prismaDisconnected = true
}

async function restoreRedisBounded() {
  if (restoreInFlight) return restoreInFlight
  restoreInFlight = (async () => {
    const startedAt = performance.now()
    if (!redisStopAttempted) {
      if (dockerContainerRunning() !== true || !dockerRedisPing()) {
        throw new HarnessError('Redis verification failed without a harness-issued stop')
      }
      return { attempts: 1, ms: Math.round(performance.now() - startedAt) }
    }
    if (dockerContainerRunning() !== true) dockerAction('start')
    const recovered = await waitForCondition(
      'Redis restoration',
      () => dockerContainerRunning() === true && dockerRedisPing(),
      15_000,
      200
    )
    if (dockerContainerRunning() !== true) throw new HarnessError('Redis restoration verification: container is not running')
    if (!dockerRedisPing()) throw new HarnessError('Redis restoration verification: redis-cli did not return PONG')
    redisStopAttempted = false
    return { attempts: recovered.attempts, ms: Math.round(performance.now() - startedAt) }
  })().finally(() => {
    restoreInFlight = null
  })
  return restoreInFlight
}

async function handleSignal(signal) {
  if (signalHandling) return
  signalHandling = true
  console.error(`\n${signal} received; verifying/restoring local Redis before exit`)
  try {
    const restored = await restoreRedisBounded()
    console.error(`Redis restored and verified | running=true pong=true time=${restored.ms}ms`)
  } catch (error) {
    console.error(`Redis restoration failed | ${safeError(error)}`)
  }
  try {
    await closeRuntimeContext()
  } catch (error) {
    console.error(`Application context close failed | ${safeError(error)}`)
  }
  try {
    await disconnectPrisma()
  } catch (error) {
    console.error(`Prisma disconnect failed | ${safeError(error)}`)
  }
  process.exit(signal === 'SIGINT' ? 130 : 143)
}

process.once('SIGINT', () => void handleSignal('SIGINT'))
process.once('SIGTERM', () => void handleSignal('SIGTERM'))

async function waitForExactRateLimitRecovery(key) {
  const startedAt = performance.now()
  const calls = []
  while (performance.now() - startedAt < RECOVERY_DEADLINE_MS) {
    const remaining = RECOVERY_DEADLINE_MS - (performance.now() - startedAt)
    const response = await otpCallForKey(key, Math.max(50, Math.min(500, Math.floor(remaining))))
    calls.push(response)
    if (exactOtpRateLimit(response)) {
      return { calls, ms: Math.round(performance.now() - startedAt) }
    }
    if (response.transportError) throw new HarnessError(`recovery request failed (${response.transportError})`)
    await sleep(Math.min(150, Math.max(0, remaining - 50)))
  }
  throw new HarnessError(`same-key API rate-limit recovery exceeded ${RECOVERY_DEADLINE_MS}ms`)
}

async function runPhase(name, phase) {
  console.log(`\n${name}`)
  try {
    await phase()
  } catch (error) {
    if (!(error instanceof PhaseAbort)) {
      fail += 1
      console.error(`  FAIL ${name} aborted | ${safeError(error)}`)
    }
  }
}

async function p1Redis() {
  const rateKey = { email: smokeEmail('redis-proof'), xff: nextXff() }
  const otpCronEmail = smokeEmail('otp-cleanup-lock')
  let otpFixtureCreated = false
  try {
    const binding = inspectRedisContainerBinding()
    requireCheck(
      'P1.0 named Redis container binding matches REDIS_URL before any mutation',
      true,
      `container=${REDIS_CONTAINER} hostPort=${redisPort} bindings=${binding.bindingCount}`
    )
    requireCheck(
      'P1.1 named Redis container is initially Running',
      dockerContainerRunning() === true,
      `container=${REDIS_CONTAINER} running=${dockerContainerRunning()}`
    )
    requireCheck('P1.1b named Redis initially answers redis-cli PONG', dockerRedisPing(), `container=${REDIS_CONTAINER}`)

    const warmApi = await request('GET', '/api-json', { timeoutMs: 1_000 })
    requireCheck(
      'P1.1c API warm-up is healthy before timing Redis behavior',
      warmApi.status === 200 && !warmApi.transportError,
      responseDiagnostics(warmApi)
    )
    const healthyApi = await request('GET', '/api-json', { timeoutMs: 500 })
    requireCheck(
      'P1.1d warm healthy API probe is 200 with no transport error under 100ms',
      healthyApi.status === 200 && !healthyApi.transportError && healthyApi.ms < HEALTHY_REQUEST_MS,
      `${responseDiagnostics(healthyApi)} limit<100ms`
    )
    await ensureRuntimeContext()
    check('P1.1e minimal Nest TestingModule initialized and resolved required services', true)

    await withTimeout(
      prisma.otpRequest.create({
        data: {
          email: otpCronEmail,
          purpose: 'REGISTER',
          otpCodeHash: `${TAG}-expired-otp-fixture`,
          expiresAt: new Date(Date.now() - 60_000)
        }
      }),
      OPERATION_TIMEOUT_MS,
      'expired OTP fixture create'
    )
    otpFixtureCreated = true

    const first = await otpCallForKey(rateKey, 500)
    requireCheck(
      'P1.2 first run-unique OTP key call is non-429, non-5xx, transport-clean, and under 100ms',
      !first.transportError && first.status !== null && first.status !== 429 && first.status < 500 && first.ms < 100,
      `${responseDiagnostics(first)} limit<100ms`
    )

    const healthyBurst = await driveKeyToRateLimit(rateKey, 5_000)
    const preLimit = healthyBurst.calls.filter((response) => !exactOtpRateLimit(response))
    requireCheck(
      'P1.2b healthy same-key burst has no transport/5xx failures and stays under 100ms before blocking',
      preLimit.every(
        (response) =>
          !response.transportError && response.status !== null && response.status !== 429 && response.status < 500 && response.ms < 100
      ),
      `${burstDiagnostics(healthyBurst.calls)} limit<100ms overall=${healthyBurst.ms}ms`
    )
    const blocked = healthyBurst.calls.at(-1)
    requireCheck(
      'P1.2c healthy same key reaches exact AUTH_OTP_RATE_LIMITED under 100ms with numeric retryAfter',
      exactOtpRateLimit(blocked) && blocked.ms < HEALTHY_REQUEST_MS,
      `${responseDiagnostics(blocked)} limit<100ms codeMatch=${blocked?.json?.code === 'AUTH_OTP_RATE_LIMITED'} retryAfterNumeric=${typeof blocked?.json?.retryAfter === 'number'}`
    )

    stopBoundRedisContainer()
    check('P1.3 docker stop succeeded', true, `container=${REDIS_CONTAINER}`)

    const stopped = await waitForCondition(
      'Redis container stop condition',
      () => dockerContainerRunning() === false,
      3_000,
      100
    )
    check('P1.3b Redis container reached stopped state', true, `attempts=${stopped.attempts} time=${stopped.ms}ms`)
    await sleep(200)

    const beforeCronCount = await withTimeout(
      prisma.otpRequest.count({ where: { email: otpCronEmail, purpose: 'REGISTER' } }),
      OPERATION_TIMEOUT_MS,
      'OTP fixture pre-cron count'
    )
    const cronStartedAt = performance.now()
    await withTimeout(runtime.otpCleanupCron.run(), 1_500, 'OtpCleanupCron.run while Redis is down')
    const cronMs = Math.round(performance.now() - cronStartedAt)
    const afterCronCount = await withTimeout(
      prisma.otpRequest.count({ where: { email: otpCronEmail, purpose: 'REGISTER' } }),
      OPERATION_TIMEOUT_MS,
      'OTP fixture post-cron count'
    )
    check(
      'P1.4 OtpCleanupCron lock fails open while Redis is down and does not mutate its expired fixture',
      beforeCronCount === 1 && afterCronCount === 1,
      `before=${beforeCronCount} after=${afterCronCount} time=${cronMs}ms`
    )

    for (let index = 1; index <= 5; index += 1) {
      const down = await otpCallForKey(rateKey, 750)
      check(
        `P1.5.${index} already-blocked exact key fails open while named Redis is down`,
        !down.transportError &&
          down.status !== null &&
          down.status !== 429 &&
          down.status < 500 &&
          down.ms < DOWN_REQUEST_MS,
        `${responseDiagnostics(down)} sameEmail=true sameXff=true limit<500ms`
      )
    }

    const apiJsonWhileDown = await request('GET', '/api-json')
    check(
      'P1.6 /api-json remains available while Redis is down',
      apiJsonWhileDown.status === 200 && !apiJsonWhileDown.transportError,
      responseDiagnostics(apiJsonWhileDown)
    )

    const restored = await restoreRedisBounded()
    check(
      'P1.7 Redis restoration verifies Running and redis-cli PONG',
      dockerContainerRunning() === true && dockerRedisPing(),
      `running=${dockerContainerRunning()} pong=${dockerRedisPing()} attempts=${restored.attempts} time=${restored.ms}ms`
    )

    const recovered = await request('GET', '/api-json', { timeoutMs: 500 })
    check(
      'P1.7b recovered successful API probe is 200 with no transport error under 100ms',
      recovered.status === 200 && !recovered.transportError && recovered.ms < HEALTHY_REQUEST_MS,
      `${responseDiagnostics(recovered)} limit<100ms`
    )

    const recoveredLimit = await waitForExactRateLimitRecovery(rateKey)
    const recoveredBlocked = recoveredLimit.calls.at(-1)
    check(
      'P1.8 exact same key enforces exact 429 under 100ms again without app restart before hard deadline',
      exactOtpRateLimit(recoveredBlocked) &&
        recoveredBlocked.ms < HEALTHY_REQUEST_MS &&
        recoveredLimit.ms <= RECOVERY_DEADLINE_MS,
      `${responseDiagnostics(recoveredBlocked)} blockedLimit<100ms calls=${recoveredLimit.calls.length} overall=${recoveredLimit.ms}ms deadline=${RECOVERY_DEADLINE_MS}ms`
    )
  } finally {
    try {
      const restored = await restoreRedisBounded()
      check(
        'P1 finally leaves named Redis Running with PONG',
        dockerContainerRunning() === true && dockerRedisPing(),
        `running=${dockerContainerRunning()} pong=${dockerRedisPing()} time=${restored.ms}ms`
      )
    } catch (error) {
      check('P1 finally leaves named Redis Running with PONG', false, safeError(error))
    }
    if (otpFixtureCreated) {
      await cleanupStep('P1 cleanup removes isolated expired OTP fixture', () =>
        prisma.otpRequest.deleteMany({ where: { email: otpCronEmail, purpose: 'REGISTER' } })
      )
    }
  }
}

function contentHash(content) {
  return createHash('sha1').update(content ?? '').digest('hex').slice(0, 16)
}

function dedupeKeyOf(recipientId, type, referenceId, referenceType, content) {
  return `${recipientId}|${type ?? ''}|${referenceId ?? ''}|${referenceType ?? ''}|${contentHash(content)}`
}

function prismaCode(error) {
  return error && typeof error === 'object' && typeof error.code === 'string' ? error.code : null
}

async function settledNotificationCreate(data) {
  try {
    const notification = await withTimeout(
      prisma.notification.create({ data }),
      OPERATION_TIMEOUT_MS,
      'P2 direct notification create'
    )
    return { created: true, id: notification.id, code: null }
  } catch (error) {
    return { created: false, id: null, code: prismaCode(error) }
  }
}

function hashRounds() {
  const configured = boundedInteger('SALT_OR_ROUNDS', 10)
  return configured >= 4 && configured <= 15 ? configured : 10
}

async function roleId(code) {
  const role = await withTimeout(
    prisma.role.findUnique({ where: { code }, select: { id: true } }),
    OPERATION_TIMEOUT_MS,
    `role ${code} lookup`
  )
  if (!role) throw new HarnessError(`Required role ${code} does not exist`)
  return role.id
}

function testPhone(suffix) {
  const digits = Number.parseInt(randomBytes(4).toString('hex'), 16).toString().padStart(10, '0').slice(-8)
  return `+849${digits}${suffix}`
}

async function createIsolatedUser(code, label, passwordHash) {
  return withTimeout(
    prisma.user.create({
      data: {
        email: smokeEmail(label),
        name: `Spec13 ${label}`,
        password: passwordHash,
        phoneNumber: testPhone(label.endsWith('editor') ? '2' : '1'),
        roleId: await roleId(code),
        status: 'ACTIVE',
        emailVerified: true,
        mustChangePassword: false,
        registrationType: 'ADMIN_CREATED'
      }
    }),
    OPERATION_TIMEOUT_MS,
    `isolated ${label} user create`
  )
}

async function cleanupStep(label, action) {
  try {
    const result = await withTimeout(Promise.resolve().then(action), OPERATION_TIMEOUT_MS, label)
    const count = result && typeof result.count === 'number' ? ` deleted=${result.count}` : ''
    check(label, true, `completed${count}`)
    return true
  } catch (error) {
    check(label, false, safeError(error))
    return false
  }
}

async function p2DatabaseUniqueness() {
  let recipient = null
  let ownsRecipient = false

  try {
    const appRuntime = await ensureRuntimeContext()
    recipient = await withTimeout(
      prisma.user.findFirst({
        where: { status: 'ACTIVE', deletedAt: { isSet: false } },
        select: { id: true }
      }),
      OPERATION_TIMEOUT_MS,
      'P2 active recipient lookup'
    )
    if (!recipient) {
      const fallbackHash = await bcrypt.hash(TEST_PASSWORD, hashRounds())
      recipient = await createIsolatedUser('MANGAKA', 'p2-recipient', fallbackHash)
      ownsRecipient = true
    }

    const recipientId = recipient.id
    const referenceId = recipient.id
    await withTimeout(
      prisma.notification.deleteMany({
        where: { recipientId, referenceType: { startsWith: TAG } }
      }),
      OPERATION_TIMEOUT_MS,
      'P2 preflight tag cleanup'
    )

    const sameReferenceType = `${TAG}_SAME`
    const sameContent = `${TAG} parallel content`
    const sameInput = {
      recipientId,
      type: 'SYSTEM',
      referenceId,
      referenceType: sameReferenceType,
      content: sameContent
    }
    const parallel = await withTimeout(
      Promise.allSettled(Array.from({ length: 10 }, () => appRuntime.notificationService.notify(sameInput))),
      OPERATION_TIMEOUT_MS,
      'P2 concurrent NotificationService.notify calls'
    )
    const sameCount = await withTimeout(
      prisma.notification.count({ where: { recipientId, referenceType: sameReferenceType } }),
      OPERATION_TIMEOUT_MS,
      'P2 concurrent notification count'
    )
    const fulfilled = parallel.filter((result) => result.status === 'fulfilled')
    const returnedIds = new Set(fulfilled.map((result) => result.value.id))
    check(
      'P2.1 actual NotificationService.notify resolves all ten concurrent identical calls',
      fulfilled.length === 10,
      `fulfilled=${fulfilled.length} rejected=${parallel.length - fulfilled.length}`
    )
    check(
      'P2.1b service concurrency leaves exactly one row and returns one persisted identity',
      sameCount === 1 && returnedIds.size === 1,
      `count=${sameCount} returnedDistinctIds=${returnedIds.size}`
    )

    const independentA = `${TAG}_INDEPENDENT_A`
    const independentB = `${TAG}_INDEPENDENT_B`
    const independentContent = `${TAG} identical independent content`
    const independentResults = await withTimeout(
      Promise.all([
        settledNotificationCreate({
          recipientId,
          type: 'SYSTEM',
          referenceId,
          referenceType: independentA,
          content: independentContent,
          dedupeKey: dedupeKeyOf(recipientId, 'SYSTEM', referenceId, independentA, independentContent)
        }),
        settledNotificationCreate({
          recipientId,
          type: 'SYSTEM',
          referenceId,
          referenceType: independentB,
          content: independentContent,
          dedupeKey: dedupeKeyOf(recipientId, 'SYSTEM', referenceId, independentB, independentContent)
        })
      ]),
      OPERATION_TIMEOUT_MS,
      'P2 independent notification creates'
    )
    const independentCount = await withTimeout(
      prisma.notification.count({
        where: { recipientId, referenceType: { in: [independentA, independentB] } }
      }),
      OPERATION_TIMEOUT_MS,
      'P2 independent notification count'
    )
    check(
      'P2.2 varying only referenceType creates two independent rows',
      independentCount === 2 && independentResults.every((result) => result.created),
      `count=${independentCount} created=${independentResults.filter((result) => result.created).length} recipientSame=true typeSame=true referenceIdSame=true contentSame=true`
    )

    const nullReferenceType = `${TAG}_NULL_REFERENCE`
    const nullContent = `${TAG} null reference content`
    const nullData = {
      recipientId,
      type: 'SYSTEM',
      referenceId: null,
      referenceType: nullReferenceType,
      content: nullContent,
      dedupeKey: dedupeKeyOf(recipientId, 'SYSTEM', null, nullReferenceType, nullContent)
    }
    const nullResults = await withTimeout(
      Promise.all([settledNotificationCreate(nullData), settledNotificationCreate(nullData)]),
      OPERATION_TIMEOUT_MS,
      'P2 null-reference notification creates'
    )
    const nullCount = await withTimeout(
      prisma.notification.count({ where: { recipientId, referenceType: nullReferenceType } }),
      OPERATION_TIMEOUT_MS,
      'P2 null-reference notification count'
    )
    check(
      'P2.3 repeated null referenceId leaves one row and one P2002',
      nullCount === 1 &&
        nullResults.filter((result) => result.created).length === 1 &&
        nullResults.filter((result) => result.code === 'P2002').length === 1,
      `count=${nullCount} created=${nullResults.filter((result) => result.created).length} p2002=${nullResults.filter((result) => result.code === 'P2002').length}`
    )

    const utcDate = new Date().toISOString().slice(0, 10)
    const cronReferenceType = `${TAG}:DEADLINE_WARNING:${utcDate}`
    const cronContent = `${TAG} immutable deadline warning`
    const cronInput = {
      recipientId,
      type: 'DEADLINE',
      referenceId,
      referenceType: cronReferenceType,
      content: cronContent
    }
    const firstCronStyle = await withTimeout(
      appRuntime.notificationService.notify(cronInput),
      OPERATION_TIMEOUT_MS,
      'P2.6 first cron-style NotificationService.notify'
    )
    const secondCronStyle = await withTimeout(
      appRuntime.notificationService.notify(cronInput),
      OPERATION_TIMEOUT_MS,
      'P2.6 second cron-style NotificationService.notify'
    )
    const cronStyleCount = await withTimeout(
      prisma.notification.count({
        where: {
          recipientId,
          type: 'DEADLINE',
          referenceId,
          referenceType: cronReferenceType,
          content: cronContent
        }
      }),
      OPERATION_TIMEOUT_MS,
      'P2.6 cron-style notification count'
    )
    check(
      'P2.6 sequential cron-style NotificationService.notify calls return one persisted identity',
      firstCronStyle.id === secondCronStyle.id && cronStyleCount === 1,
      `sameId=${firstCronStyle.id === secondCronStyle.id} count=${cronStyleCount} referenceType=${cronReferenceType}`
    )

  } finally {
    if (recipient) {
      await cleanupStep('P2 cleanup removes tag-scoped notifications', () =>
        prisma.notification.deleteMany({
          where: { recipientId: recipient.id, referenceType: { startsWith: TAG } }
        })
      )
      if (ownsRecipient) {
        await cleanupStep('P2 cleanup removes fallback refresh tokens', () =>
          prisma.refreshToken.deleteMany({ where: { userId: recipient.id } })
        )
        await cleanupStep('P2 cleanup removes fallback user', () => prisma.user.deleteMany({ where: { id: recipient.id } }))
      }
    }
  }
}

async function login(email, password) {
  const response = await request('POST', '/auth/login', { body: { email, password } })
  requireCheck('P2.5 login succeeds', response.status === 201, responseDiagnostics(response))
  const token = response.json?.data?.accessToken
  requireCheck(
    'P2.5 login response contains data.accessToken',
    typeof token === 'string' && token.length > 0,
    `accessToken=${typeof token === 'string' && token.length > 0 ? 'present' : 'missing'}`
  )
  return token
}

function keyPaths(value, target, path = '$', seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return []
  seen.add(value)

  const matches = []
  for (const [key, child] of Object.entries(value)) {
    const childPath = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`
    if (key === target) matches.push(childPath)
    matches.push(...keyPaths(child, target, childPath, seen))
  }
  return matches
}

async function discoverP25Owned(context) {
  if (!context.mangaka) return { seriesIds: [], nameIds: [], seriesRows: [], nameRows: [] }
  const seriesRows = await withTimeout(
    prisma.series.findMany({
      where: { mangakaId: context.mangaka.id, title: context.seriesTitle },
      select: { id: true, proposal: true }
    }),
    OPERATION_TIMEOUT_MS,
    'P2.5 owned series discovery'
  )
  const seriesIds = seriesRows.map((series) => series.id)
  const nameRows =
    seriesIds.length === 0
      ? []
      : await withTimeout(
          prisma.name.findMany({
            where: { seriesId: { in: seriesIds } },
            select: { id: true, seriesId: true }
          }),
          OPERATION_TIMEOUT_MS,
          'P2.5 owned Name discovery'
        )
  return { seriesIds, nameIds: nameRows.map((name) => name.id), seriesRows, nameRows }
}

async function p25OwnedCounts(userIds, owned) {
  const entityIds = [...owned.seriesIds, ...owned.nameIds]
  const notificationWhere = {
    OR: [
      { recipientId: { in: userIds } },
      ...(entityIds.length > 0 ? [{ referenceId: { in: entityIds } }] : [])
    ]
  }
  const auditWhere = {
    OR: [
      { actorId: { in: userIds } },
      ...(entityIds.length > 0 ? [{ entityId: { in: entityIds } }] : [])
    ]
  }
  const [notifications, audits, names, series, tokens, users] = await Promise.all([
    prisma.notification.count({ where: notificationWhere }),
    prisma.auditLog.count({ where: auditWhere }),
    prisma.name.count({ where: { id: { in: owned.nameIds } } }),
    prisma.series.count({ where: { id: { in: owned.seriesIds } } }),
    prisma.refreshToken.count({ where: { userId: { in: userIds } } }),
    prisma.user.count({ where: { id: { in: userIds } } })
  ])
  return { notifications, audits, names, series, tokens, users }
}

async function cleanupP25(context) {
  const userIds = [context.mangaka?.id, context.editor?.id].filter(Boolean)
  if (userIds.length === 0) return

  let owned = { seriesIds: [], nameIds: [], seriesRows: [], nameRows: [] }
  let ownershipVerified = false
  try {
    owned = await discoverP25Owned(context)
    ownershipVerified =
      !context.proposalCreateSucceeded ||
      (owned.seriesIds.length > 0 && owned.nameIds.length > 0)
  } catch (error) {
    check('P2.5 cleanup derives owned Series and Names', false, safeError(error))
  }
  const entityIds = [...owned.seriesIds, ...owned.nameIds]
  await cleanupStep('P2.5 cleanup removes dependent notifications', () =>
    prisma.notification.deleteMany({
      where: {
        OR: [
          { recipientId: { in: userIds } },
          ...(entityIds.length > 0 ? [{ referenceId: { in: entityIds } }] : [])
        ]
      }
    })
  )
  await cleanupStep('P2.5 cleanup removes dependent audit logs', () =>
    prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: userIds } },
          ...(entityIds.length > 0 ? [{ entityId: { in: entityIds } }] : [])
        ]
      }
    })
  )
  await cleanupStep('P2.5 cleanup removes derived Names', () =>
    prisma.name.deleteMany({ where: { id: { in: owned.nameIds } } })
  )
  await cleanupStep('P2.5 cleanup removes derived Series', () =>
    prisma.series.deleteMany({ where: { id: { in: owned.seriesIds } } })
  )
  await cleanupStep('P2.5 cleanup removes refresh tokens', () =>
    prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } })
  )

  let dependenciesZero = false
  try {
    const beforeUsers = await withTimeout(
      p25OwnedCounts(userIds, owned),
      OPERATION_TIMEOUT_MS,
      'P2.5 pre-user cleanup verification'
    )
    dependenciesZero = Object.entries(beforeUsers)
      .filter(([key]) => key !== 'users')
      .every(([, count]) => count === 0)
    check(
      'P2.5 cleanup verifies zero owned dependencies before deleting users',
      dependenciesZero,
      Object.entries(beforeUsers)
        .map(([key, count]) => `${key}=${count}`)
        .join(' ')
    )
  } catch (error) {
    check('P2.5 cleanup verifies zero owned dependencies before deleting users', false, safeError(error))
  }

  if (ownershipVerified && dependenciesZero) {
    await cleanupStep('P2.5 cleanup removes isolated users', () =>
      prisma.user.deleteMany({ where: { id: { in: userIds } } })
    )
  } else {
    check(
      'P2.5 cleanup removes isolated users',
      false,
      `skipped ownershipVerified=${ownershipVerified} dependenciesZero=${dependenciesZero}`
    )
  }

  try {
    const finalCounts = await withTimeout(
      p25OwnedCounts(userIds, owned),
      OPERATION_TIMEOUT_MS,
      'P2.5 final cleanup verification'
    )
    check(
      'P2.5 post-cleanup owned notifications/audits/Names/Series/tokens/users are zero',
      Object.values(finalCounts).every((count) => count === 0),
      Object.entries(finalCounts)
        .map(([key, count]) => `${key}=${count}`)
        .join(' ')
    )
  } catch (error) {
    check('P2.5 post-cleanup owned counts are zero', false, safeError(error))
  }
}

async function p25RealApi() {
  const context = {
    mangaka: null,
    editor: null,
    responseSeriesId: null,
    responseNameId: null,
    proposalCreateSucceeded: false,
    seriesId: null,
    nameId: null,
    seriesTitle: `${TAG} review series`
  }

  try {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, hashRounds())
    context.mangaka = await createIsolatedUser('MANGAKA', 'mangaka', passwordHash)
    context.editor = await createIsolatedUser('EDITOR', 'editor', passwordHash)
    check('P2.5 isolated Mangaka and Editor created with real roles and password hash', true, 'users=2')

    const mangakaToken = await login(context.mangaka.email, TEST_PASSWORD)
    const editorToken = await login(context.editor.email, TEST_PASSWORD)

    const created = await request('POST', '/series/proposals', {
      token: mangakaToken,
      body: {
        title: context.seriesTitle,
        genres: ['ACTION'],
        demographic: 'SHONEN',
        synopsis: `${TAG} API smoke proposal`
      }
    })
    requireCheck('P2.5 proposal create returns 201', created.status === 201, responseDiagnostics(created))
    context.proposalCreateSucceeded = true

    context.responseSeriesId = created.json?.data?.series?.id ?? null
    context.responseNameId = created.json?.data?.series?.proposal?.nameId ?? null
    const owned = await discoverP25Owned(context)
    const responseSeriesOwned = owned.seriesIds.includes(context.responseSeriesId)
    const responseNameOwned = owned.nameRows.some(
      (name) => name.id === context.responseNameId && name.seriesId === context.responseSeriesId
    )
    const nestedNameOwned = owned.seriesRows.some(
      (series) => series.id === context.responseSeriesId && series.proposal?.nameId === context.responseNameId
    )
    requireCheck(
      'P2.5 response IDs intersect exactly one DB-owned Series and its derived Name',
      owned.seriesIds.length === 1 &&
        owned.nameIds.length === 1 &&
        typeof context.responseSeriesId === 'string' &&
        OBJECT_ID_RE.test(context.responseSeriesId) &&
        typeof context.responseNameId === 'string' &&
        OBJECT_ID_RE.test(context.responseNameId) &&
        responseSeriesOwned &&
        responseNameOwned &&
        nestedNameOwned,
      `ownedSeries=${owned.seriesIds.length} ownedNames=${owned.nameIds.length} responseSeriesOwned=${responseSeriesOwned} responseNameOwned=${responseNameOwned} nestedNameOwned=${nestedNameOwned}`
    )
    context.seriesId = owned.seriesIds[0]
    context.nameId = owned.nameIds[0]

    const submitted = await request('POST', `/series/${context.seriesId}/submit`, { token: mangakaToken })
    requireCheck('P2.5 proposal submit returns 201', submitted.status === 201, responseDiagnostics(submitted))

    const claimed = await request('POST', `/series/${context.seriesId}/claim`, { token: editorToken })
    requireCheck('P2.5 Editor claim returns 201', claimed.status === 201, responseDiagnostics(claimed))

    const reasonA = `${TAG} reason A: revise panel layout`
    const revisionA = await request(
      'POST',
      `/series/${context.seriesId}/names/${context.nameId}/request-revision`,
      { token: editorToken, body: { reason: reasonA } }
    )
    requireCheck('P2.5 Name request-revision A returns 201', revisionA.status === 201, responseDiagnostics(revisionA))

    const resubmitted = await request('POST', `/series/${context.seriesId}/names/${context.nameId}/resubmit`, {
      token: mangakaToken
    })
    requireCheck('P2.5 Name resubmit returns 201', resubmitted.status === 201, responseDiagnostics(resubmitted))

    const reasonB = `${TAG} reason B: shorten dialogue`
    const revisionB = await request(
      'POST',
      `/series/${context.seriesId}/names/${context.nameId}/request-revision`,
      { token: editorToken, body: { reason: reasonB } }
    )
    requireCheck('P2.5 Name request-revision B returns 201', revisionB.status === 201, responseDiagnostics(revisionB))

    const notificationWait = await waitForCondition(
      'two NAME_REVISION_REQUESTED notifications',
      async () =>
        (await withTimeout(
          prisma.notification.count({
            where: {
              recipientId: context.mangaka.id,
              referenceId: context.seriesId,
              referenceType: 'NAME_REVISION_REQUESTED'
            }
          }),
          OPERATION_TIMEOUT_MS,
          'P2.5 revision notification count'
        )) >= 2,
      5_000,
      100
    )
    check(
      'P2.5 notification side effects settled',
      true,
      `attempts=${notificationWait.attempts} time=${notificationWait.ms}ms`
    )

    const notifications = await withTimeout(
      prisma.notification.findMany({
        where: {
          recipientId: context.mangaka.id,
          referenceId: context.seriesId,
          referenceType: 'NAME_REVISION_REQUESTED'
        },
        orderBy: { createdAt: 'asc' }
      }),
      OPERATION_TIMEOUT_MS,
      'P2.5 revision notification lookup'
    )
    check(
      'P2.5 exactly two NAME_REVISION_REQUESTED rows exist',
      notifications.length === 2,
      `count=${notifications.length}`
    )
    check(
      'P2.5 revision notifications have different content',
      notifications.length === 2 &&
        notifications[0].content !== notifications[1].content &&
        notifications.some((notification) => notification.content?.includes(reasonA)) &&
        notifications.some((notification) => notification.content?.includes(reasonB)),
      `count=${notifications.length} distinct=${new Set(notifications.map((notification) => notification.content)).size}`
    )
    check(
      'P2.4a DB rows contain non-empty, different dedupeKey values',
      notifications.length === 2 &&
        notifications.every((notification) => typeof notification.dedupeKey === 'string' && notification.dedupeKey.length > 0) &&
        notifications[0].dedupeKey !== notifications[1].dedupeKey,
      `count=${notifications.length} keysPresent=${notifications.filter((notification) => notification.dedupeKey).length} distinct=${new Set(notifications.map((notification) => notification.dedupeKey)).size}`
    )

    const listResponse = await request('GET', '/notifications', { token: mangakaToken })
    check('P2.4b authenticated GET /notifications returns 200', listResponse.status === 200, responseDiagnostics(listResponse))
    const leakedPaths = keyPaths(listResponse.json, 'dedupeKey')
    check(
      'P2.4c actual notification API response recursively omits dedupeKey',
      listResponse.status === 200 && leakedPaths.length === 0,
      `dedupeKeyPaths=${leakedPaths.length}`
    )
    const apiItems = Array.isArray(listResponse.json?.data?.items) ? listResponse.json.data.items : []
    const dbIds = new Set(notifications.map((notification) => notification.id))
    check(
      'P2.4d actual notification API response includes both revision rows',
      notifications.length === 2 && notifications.every((notification) => apiItems.some((item) => item?.id === notification.id)),
      `dbRows=${dbIds.size} apiItems=${apiItems.length}`
    )
  } finally {
    await cleanupP25(context)
  }
}

function configuredCorsOrigins() {
  return (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

async function p3Cors() {
  const configured = configuredCorsOrigins()
  const unknownOrigin = `https://${TAG}.unknown.invalid`
  const preflight = (origin) =>
    request('OPTIONS', '/api-json', {
      origin,
      timeoutMs: 1_000,
      headers: { 'access-control-request-method': 'GET' }
    })
  const unknown = await preflight(unknownOrigin)
  const unknownAllow = unknown.headers?.get('access-control-allow-origin') ?? null
  check(
    'P3.1 CORS OPTIONS preflight completes without transport/5xx failure',
    !unknown.transportError && unknown.status !== null && unknown.status < 500,
    responseDiagnostics(unknown)
  )

  if (configured.length === 0) {
    check(
      'P3.2 blank CORS_ORIGINS preflight allows an unknown origin with wildcard',
      unknownAllow === '*',
      `allowOrigin=${unknownAllow ?? 'missing'}`
    )
    return
  }

  check(
    'P3.2 configured CORS_ORIGINS preflight does not allow an unknown origin',
    unknownAllow !== '*' && unknownAllow !== unknownOrigin,
    `allowOrigin=${unknownAllow ?? 'missing'}`
  )

  const allowedOrigin = configured[0]
  const allowed = await preflight(allowedOrigin)
  const allowedHeader = allowed.headers?.get('access-control-allow-origin') ?? null
  check(
    'P3.3 configured-origin OPTIONS preflight completes without transport/5xx failure',
    !allowed.transportError && allowed.status !== null && allowed.status < 500,
    responseDiagnostics(allowed)
  )
  check(
    'P3.4 a configured CORS origin is allowed',
    allowedHeader === allowedOrigin,
    `allowOrigin=${allowedHeader ?? 'missing'} configuredOriginMatch=${allowedHeader === allowedOrigin}`
  )
}

async function main() {
  validateLocalHarness()
  inspectRedisContainerBinding()
  await runPhase('P1 Redis fail-open and recovery', p1Redis)
  await runPhase('P2 Notification database uniqueness', p2DatabaseUniqueness)
  await runPhase('P2.5 Real API Name revision flow', p25RealApi)
  await runPhase('P3 Current CORS behavior', p3Cors)
}

try {
  await main()
} catch (error) {
  fail += 1
  console.error(`\nFAIL uncaught smoke error | ${safeError(error)}`)
} finally {
  try {
    const restored = await restoreRedisBounded()
    check(
      'HARNESS top-level finally restores and verifies Redis Running with PONG',
      dockerContainerRunning() === true && dockerRedisPing(),
      `container=${REDIS_CONTAINER} running=${dockerContainerRunning()} pong=${dockerRedisPing()} time=${restored.ms}ms`
    )
  } catch (error) {
    check('HARNESS top-level finally restores and verifies Redis Running with PONG', false, safeError(error))
  }

  try {
    await closeRuntimeContext()
    check('HARNESS Nest application context closed within deadline', true)
  } catch (error) {
    check('HARNESS Nest application context closed within deadline', false, safeError(error))
  }

  try {
    await disconnectPrisma()
    check('HARNESS Prisma disconnected', true)
  } catch (error) {
    check('HARNESS Prisma disconnected', false, safeError(error))
  }

  console.log(`\nSpec 13 smoke result: ${pass} PASS / ${fail} FAIL`)
  process.exit(fail > 0 ? 1 : 0)
}
