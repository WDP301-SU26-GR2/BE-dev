/**
 * Generator: sinh lại `route-roles.ts` từ METADATA RUNTIME (không regex controller).
 *
 * Cơ chế: boot NestApplicationContext từ dist/app.module.js → enumerate controllers
 * qua ModulesContainer → đọc Reflect metadata:
 *   - PATH_METADATA ('path') trên class + handler → full route path
 *   - METHOD_METADATA ('method') trên handler → HTTP verb (RequestMethod enum)
 *   - ROLES_KEY ('roles') handler-first-then-class (khớp RolesGuard getAllAndOverride)
 *   - AUTH_TYPE_KEY (env, default 'authType') → authType chứa 'None' = PUBLIC
 *
 * Access levels:
 *   - PUBLIC: @IsPublic() — không cần token
 *   - AUTH:   cần Bearer, không giới hạn role
 *   - ROLES:  cần Bearer + @Roles(...)
 *
 * Chạy: pnpm flowtest:one test/flows/_generate-route-roles.ts
 * (cần `pnpm build` trước — đọc dist/)
 */
import { NestFactory } from '@nestjs/core'
import { ModulesContainer } from '@nestjs/core'
import { RequestMethod } from '@nestjs/common'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import './lib/env.js'

const APP_MODULE_PATH = path.resolve(process.cwd(), 'dist/app.module.js')
const OUT_PATH = path.resolve(process.cwd(), 'test/flows/route-roles.ts')

const METHOD_NAMES: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH'
}

const joinPath = (...parts: Array<string | undefined>): string => {
  const segs = parts
    .filter((p): p is string => Boolean(p) && p !== '/')
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
  return '/' + segs.join('/')
}

type Rule = { method: string; path: string; access: 'PUBLIC' | 'AUTH' | 'ROLES'; allowed: string[] }

const main = async () => {
  const mod = await import(pathToFileURL(APP_MODULE_PATH).href)
  const AppModule = mod.AppModule ?? mod.default
  if (!AppModule) throw new Error('AppModule not found — run pnpm build first')

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
    bufferLogs: true
  })
  // Hard timeout — MongoDB replicaSet nếu chưa chạy sẽ treo vô hạn ở onModuleInit.
  // 12s là đủ cho happy-path; nếu connect xong sớm hơn thì bước dưới đã xử lý xong.
  const GEN_TIMEOUT_MS = 12_000
  const genTimeout = setTimeout(() => {
    console.error(`[generate-route-roles] Timeout ${GEN_TIMEOUT_MS}ms — kiểm tra MongoDB replicaSet + Redis đang chạy.`)
    process.exit(3)
  }, GEN_TIMEOUT_MS)
  const authKey = process.env.AUTH_TYPE_KEY ?? 'authType'
  const rules: Rule[] = []

  try {
    const container = app.get(ModulesContainer)
    for (const [, moduleRef] of container.entries()) {
      for (const [, wrapper] of moduleRef.controllers.entries()) {
        const cls = wrapper.metatype as (new () => unknown) | undefined
        if (!cls) continue
        const ctrlPathMeta = Reflect.getMetadata('path', cls) as string | string[] | undefined
        const ctrlPaths = Array.isArray(ctrlPathMeta) ? ctrlPathMeta : [ctrlPathMeta ?? '']
        const classRoles = Reflect.getMetadata('roles', cls) as string[] | undefined
        const classAuth = Reflect.getMetadata(authKey, cls) as { authType?: string[] } | undefined

        for (const propName of Object.getOwnPropertyNames(cls.prototype)) {
          if (propName === 'constructor') continue
          const handler = (cls.prototype as Record<string, unknown>)[propName]
          if (typeof handler !== 'function') continue
          const methodNum = Reflect.getMetadata('method', handler) as number | undefined
          const handlerPathMeta = Reflect.getMetadata('path', handler) as string | string[] | undefined
          if (methodNum === undefined || handlerPathMeta === undefined) continue
          const verb = METHOD_NAMES[methodNum]
          if (!verb) continue

          // RolesGuard: getAllAndOverride handler-first-then-class
          const handlerRoles = Reflect.getMetadata('roles', handler) as string[] | undefined
          const roles = handlerRoles ?? classRoles ?? []
          const auth = (Reflect.getMetadata(authKey, handler) as { authType?: string[] } | undefined) ?? classAuth
          const isPublic = Boolean(auth?.authType?.includes('None'))

          const handlerPaths = Array.isArray(handlerPathMeta) ? handlerPathMeta : [handlerPathMeta]
          for (const cp of ctrlPaths) {
            for (const hp of handlerPaths) {
              rules.push({
                method: verb,
                path: joinPath(cp, hp),
                access: isPublic ? 'PUBLIC' : roles.length ? 'ROLES' : 'AUTH',
                allowed: isPublic ? [] : roles
              })
            }
          }
        }
      }
    }
  } finally {
    await app.close()
  }

  // Dedup + sort ổn định
  const seen = new Set<string>()
  const unique = rules.filter((r) => {
    const k = `${r.method} ${r.path}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  unique.sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)))

  const lines = unique.map((r) => {
    const allowed = r.allowed.length ? `[${r.allowed.map((x) => `RoleCode.${x}`).join(', ')}]` : '[]'
    return `  { method: '${r.method}', path: '${r.path}', access: '${r.access}', allowed: ${allowed} },`
  })

  const content = `// ⚠ FILE SINH TỰ ĐỘNG bởi _generate-route-roles.ts — ĐỪNG SỬA TAY.
// Sinh từ Reflect metadata runtime (PATH/METHOD/ROLES/AUTH_TYPE) của dist/ thật.
// Regenerate: pnpm build && pnpm flowtest:one test/flows/_generate-route-roles.ts
// Sinh lúc: ${new Date().toISOString()} — ${unique.length} routes.
//
// access:
//   PUBLIC — @IsPublic(), không cần token (none/mọi role đều KHÔNG bị 401/403)
//   AUTH   — cần Bearer, không giới hạn role (none → 401; mọi role qua)
//   ROLES  — cần Bearer + @Roles(...) (none → 401; role ∉ allowed → 403)

import { RoleCode } from '@prisma/client'

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
export type RouteAccess = 'PUBLIC' | 'AUTH' | 'ROLES'

export type RouteRule = {
  method: HttpMethod
  path: string
  access: RouteAccess
  allowed: RoleCode[]
}

export const ROLE_FIXTURES_ORDER: RoleCode[] = [
  RoleCode.SUPER_ADMIN,
  RoleCode.MANGAKA,
  RoleCode.ASSISTANT,
  RoleCode.EDITOR,
  RoleCode.BOARD_MEMBER
]

export const ROUTE_RULES: RouteRule[] = [
${lines.join('\n')}
]
`
  fs.writeFileSync(OUT_PATH, content, 'utf-8')
  console.log(`[generate-route-roles] wrote ${unique.length} routes → ${OUT_PATH}`)
  const counts = { PUBLIC: 0, AUTH: 0, ROLES: 0 }
  unique.forEach((r) => counts[r.access]++)
  console.log(`[generate-route-roles] PUBLIC=${counts.PUBLIC} AUTH=${counts.AUTH} ROLES=${counts.ROLES}`)
  clearTimeout(genTimeout)
  // exit explicitly — Mongo keep-alive socket nếu không đóng gọn sẽ block process thoát.
  process.exit(0)
}

void main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
