import { API } from './env.js'

let pass = 0
let fail = 0
const findings: string[] = []

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type Res = { status: number; json: any; raw: string }

const decodeJsonSafe = (raw: string): any => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const req = async (
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; xff?: string; headers?: Record<string, string> } = {}
): Promise<Res> => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      'x-forwarded-for': opts.xff ?? '203.0.113.50',
      ...(opts.headers ?? {})
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  })
  const raw = await res.text()
  return { status: res.status, json: decodeJsonSafe(raw), raw }
}

export const section = (title: string) => console.log(`\n===== ${title} =====`)

export const ok = (name: string, cond: boolean, extra = '') => {
  if (cond) {
    pass++
    console.log(`  PASS ${name}`)
  } else {
    fail++
    console.log(`  FAIL ${name} ${extra}`)
  }
}

// Bug thật của BE phát hiện qua test — KHÔNG fix BE, ghi lại cho BE-A review.
export const finding = (name: string, note: string) => {
  fail++
  findings.push(`${name}: ${note}`)
  console.log(`  FAIL(FINDING) ${name} — ${note}`)
}

export const expectStatus = (r: Res, status: number, name: string) =>
  ok(name, r.status === status, `expect ${status} got ${r.status} ${r.raw?.slice(0, 200)}`)

// Check status + mã Error.* (message top-level HOẶC errors[].message).
// Error code thường có dạng `Error.XYZ`; ngoài ra có code dạng `AUTH_OTP_RATE_LIMITED` (rate-limit).
export const expectError = (r: Res, status: number, code: string, name: string) => {
  const top = typeof r.json?.message === 'string' ? r.json.message : ''
  const arr = Array.isArray(r.json?.errors) ? (r.json.errors as unknown[]) : []
  const fieldMsgs = arr
    .map((e) =>
      e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string'
        ? (e as { message: string }).message
        : ''
    )
    .filter((m): m is string => Boolean(m))
  const msgs = [top, ...fieldMsgs]
  ok(
    name,
    r.status === status && msgs.includes(code),
    `expect ${status}+${code} got ${r.status} ${JSON.stringify(msgs)}`
  )
}

export const summary = (file: string): number => {
  console.log(`\n===== ${file}: ${pass} PASS / ${fail} FAIL =====`)
  if (findings.length) {
    console.log(`\n--- FINDINGS (bug BE nghi ngờ — BE-A review) ---`)
    findings.forEach((f) => console.log(`  • ${f}`))
  }
  return fail
}

// Reset counters (giữa các file trong cùng run).
export const resetCounters = () => {
  pass = 0
  fail = 0
  findings.length = 0
}

export const getCounters = () => ({ pass, fail, findings: [...findings] })
