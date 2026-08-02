/**
 * Cross-cutting RBAC probe sweep — RBAC CONTRACT chính thức (spec §15).
 *
 * Bảng `route-roles.ts` SINH TỰ ĐỘNG từ Reflect metadata runtime (không đoán tay).
 * Với mỗi route × 6 token (none + 5 role), body `{}` (guard chạy TRƯỚC pipe nên
 * body rỗng vẫn đủ để assert 401/403):
 *
 *   - PUBLIC: bypass JWT; none + mọi role → KHÔNG 401/403 khi đáp ứng guard cục bộ (nếu có)
 *   - AUTH:   none → 401; mọi role → KHÔNG 401/403
 *   - ROLES:  none → 401; role ∉ allowed → 403; role ∈ allowed → KHÔNG 401/403
 *
 * Sweep phát hiện code lệch bảng = FINDING (bảng là contract).
 * Total probes: 226 routes × 6 = 1.356.
 */

import { RoleCode } from '@prisma/client'
import { wipeDb, seedRolesAndAdmin, makeUser, prisma } from './lib/seed.js'
import { req, ok, section, summary, resetCounters } from './lib/http.js'
import { login, clearTokenCache } from './lib/auth.js'
import { ROUTE_RULES, ROLE_FIXTURES_ORDER } from './route-roles.js'

const FLOW = 'cross-rbac-sweep'

// ObjectId hợp lệ-nhưng-không-tồn-tại → route :id trả 404 (KHÔNG 500) là hành vi đúng.
const substituteParams = (path: string): string => path.replace(/:[a-zA-Z]+/g, 'aaaaaaaaaaaaaaaaaaaaaaaa')
const substituteMalformedObjectId = (path: string): string =>
  path.replace(/:([a-zA-Z]*id)\b/gi, 'not-an-object-id').replace(/:[a-zA-Z]+/g, 'aaaaaaaaaaaaaaaaaaaaaaaa')
const normalizeOpenApiPath = (path: string): string => path.replace(/\{([^}]+)\}/g, ':$1')

async function verifyOpenApiRouteSnapshot(): Promise<void> {
  const response = await req('GET', '/api-json')
  const document = response.json as { paths?: Record<string, Record<string, unknown>> }
  const documented = new Set(
    Object.entries(document.paths ?? {}).flatMap(([path, operations]) =>
      Object.keys(operations)
        .map((method) => method.toUpperCase())
        .filter((method): method is 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' =>
          ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
        )
        .map((method) => `${method} ${normalizeOpenApiPath(path)}`)
    )
  )
  const expected = new Set([
    ...ROUTE_RULES.map((rule) => `${rule.method} ${rule.path}`),
    'GET /health/live',
    'GET /health/ready',
    'GET /metrics'
  ])
  const missing = [...expected].filter((route) => !documented.has(route)).sort()
  const unexpected = [...documented].filter((route) => !expected.has(route)).sort()

  ok(
    'OpenAPI path snapshot matches the authoritative runtime route table',
    response.status === 200 && missing.length === 0 && unexpected.length === 0,
    `status=${response.status}; missing=${missing.join(', ') || 'none'}; unexpected=${unexpected.join(', ') || 'none'}`
  )
}

/**
 * Route có OBJECT-LEVEL authorization (S-01, BACKEND_AUDIT_2026-07-20).
 *
 * Sweep này chỉ kiểm được tầng RBAC theo VAI TRÒ. Ba route dưới đây còn một tầng nữa:
 * service kiểm quyền sở hữu trên chính bản ghi (receiver / chủ contract / editor phụ trách).
 * Sweep dùng id giả + user không sở hữu gì, nên **403 là kết quả ĐÚNG** — service chọn
 * từ chối thay vì trả 404 để không lộ sự tồn tại của bản ghi tiền.
 *
 * Giả định cũ ở nhánh "allowed" ("id giả → 404 trước khi so scope") không còn đúng sau S-01,
 * và đó là lý do 5 probe này đỏ. Với các route này ta chỉ khẳng định KHÔNG bị 401
 * (tức đã qua guard xác thực); 401 vẫn là FAIL như thường.
 *
 * ⚠ Chỉ thêm route vào đây khi service THỰC SỰ kiểm sở hữu trước khi lộ dữ liệu —
 * đừng dùng nó để "làm cho xanh" một route bị 403 vì cấu hình @Roles sai.
 */
const OBJECT_SCOPED_ROUTES = new Set([
  'GET /payments/contracts/:id/payments',
  'GET /payments/series/:id/payments',
  'GET /payments/users/:id/payments'
])

const machineAuthHeaders = (method: string, path: string): Record<string, string> | undefined => {
  if (`${method} ${path}` !== 'GET /metrics') return undefined
  if (!process.env.API_KEY) throw new Error('API_KEY is required to verify the machine-authenticated metrics route')
  return { 'x-api-key': process.env.API_KEY }
}

const main = async () => {
  resetCounters()
  console.log(`\n##### ${FLOW} #####`)
  await wipeDb()
  await seedRolesAndAdmin()

  // Seed 1 user mỗi role + token (mustChangePassword=false → PasswordPolicyGuard không chặn).
  clearTokenCache()
  const tokens = new Map<RoleCode, string>()
  for (const role of ROLE_FIXTURES_ORDER) {
    const u = await makeUser(role)
    tokens.set(role, await login(u.email))
  }

  section('rbac-sweep (none + 5 role × mỗi route)')
  await verifyOpenApiRouteSnapshot()

  const metricsWithoutKey = await req('GET', '/metrics')
  const metricsWithWrongKey = await req('GET', '/metrics', { headers: { 'x-api-key': 'wrong-flowtest-key' } })
  ok('GET /metrics without machine API key → 401', metricsWithoutKey.status === 401, `got ${metricsWithoutKey.status}`)
  ok(
    'GET /metrics with wrong machine API key → 401',
    metricsWithWrongKey.status === 401,
    `got ${metricsWithWrongKey.status}`
  )

  section('malformed ObjectId sweep (every runtime :id route)')
  for (const rule of ROUTE_RULES.filter((candidate) => /:([a-zA-Z]*id)\b/i.test(candidate.path))) {
    const role = rule.access === 'ROLES' ? rule.allowed[0] : ROLE_FIXTURES_ORDER[0]
    const token = rule.access === 'PUBLIC' ? undefined : tokens.get(role)
    const needsBody = rule.method === 'POST' || rule.method === 'PATCH' || rule.method === 'PUT'
    const response = await req(rule.method, substituteMalformedObjectId(rule.path), {
      token,
      body: needsBody ? {} : undefined
    })
    ok(
      `${rule.method} ${rule.path} malformed ObjectId is rejected before persistence`,
      response.status >= 400 && response.status < 500 && response.status !== 401,
      `got ${response.status}`
    )
  }

  for (const rule of ROUTE_RULES) {
    const realPath = substituteParams(rule.path)
    const needsBody = rule.method === 'POST' || rule.method === 'PATCH' || rule.method === 'PUT'
    const body = needsBody ? {} : undefined
    const headers = machineAuthHeaders(rule.method, rule.path)

    // Probe KHÔNG token
    const rNone = await req(rule.method, realPath, { body, headers })
    if (rule.access === 'PUBLIC') {
      ok(
        `${rule.method} ${rule.path} @ none public`,
        rNone.status !== 401 && rNone.status !== 403,
        `got ${rNone.status}`
      )
    } else {
      ok(`${rule.method} ${rule.path} @ none → 401`, rNone.status === 401, `got ${rNone.status}`)
    }

    // Probe 5 role
    for (const role of ROLE_FIXTURES_ORDER) {
      const tok = tokens.get(role)!
      const r = await req(rule.method, realPath, { token: tok, body, headers })
      const name = `${rule.method} ${rule.path} @ ${role}`

      if (rule.access === 'PUBLIC' || rule.access === 'AUTH' || rule.allowed.includes(role)) {
        // Không được chặn bởi RBAC (guard). 404/409/422/429 = qua guard, OK.
        // Dummy id → service thường 404 trước khi so scope nên 403 service-level không xảy ra.
        // Ngoại lệ: route object-scoped (S-01) từ chối bằng 403 để không lộ sự tồn tại — xem chú thích trên.
        if (OBJECT_SCOPED_ROUTES.has(`${rule.method} ${rule.path}`)) {
          ok(`${name} allowed (object-scoped: 403 hợp lệ)`, r.status !== 401, `got ${r.status}`)
        } else {
          ok(`${name} allowed`, r.status !== 401 && r.status !== 403, `got ${r.status}`)
        }
      } else {
        ok(`${name} denied → 403`, r.status === 403, `got ${r.status}`)
      }
    }
  }

  await prisma.$disconnect()
  const fail = summary(FLOW)
  process.exit(fail > 0 ? 1 : 0)
}

void main().catch(async (e) => {
  console.error('FATAL', e)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})
