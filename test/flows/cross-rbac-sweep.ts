/**
 * Cross-cutting RBAC probe sweep — RBAC CONTRACT chính thức (spec §15).
 *
 * Bảng `route-roles.ts` SINH TỰ ĐỘNG từ Reflect metadata runtime (không đoán tay).
 * Với mỗi route × 6 token (none + 5 role), body `{}` (guard chạy TRƯỚC pipe nên
 * body rỗng vẫn đủ để assert 401/403):
 *
 *   - PUBLIC: none + mọi role → KHÔNG 401/403 (2xx/404/409/422/429/… OK)
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
  for (const rule of ROUTE_RULES) {
    const realPath = substituteParams(rule.path)
    const needsBody = rule.method === 'POST' || rule.method === 'PATCH' || rule.method === 'PUT'
    const body = needsBody ? {} : undefined

    // Probe KHÔNG token
    const rNone = await req(rule.method, realPath, { body })
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
      const r = await req(rule.method, realPath, { token: tok, body })
      const name = `${rule.method} ${rule.path} @ ${role}`

      if (rule.access === 'PUBLIC' || rule.access === 'AUTH' || rule.allowed.includes(role)) {
        // Không được chặn bởi RBAC (guard). 404/409/422/429 = qua guard, OK.
        // Dummy id → service 404 trước khi so scope nên 403 service-level không xảy ra.
        ok(`${name} allowed`, r.status !== 401 && r.status !== 403, `got ${r.status}`)
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
