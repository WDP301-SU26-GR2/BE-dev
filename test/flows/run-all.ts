import { spawnSync } from 'node:child_process'
import { API, DATABASE_URL } from './lib/env.js'

// Thứ tự chạy (theo spec §19): 11 → 01 → 06 → 02 → 03 → 04 → 05 → 07 → 08 → 10 → 12-13 → rbac → ws → cron → events
const FILES = [
  'flow-11-auth-identity.ts',
  'flow-01-serialization.ts',
  'flow-06-contract-payment.ts',
  'flow-02-chapter-production.ts',
  'flow-03-task-studio.ts',
  'flow-04-voting-ranking.ts',
  'flow-05-lifecycle.ts',
  'flow-07-reprint.ts',
  'flow-08-transfer.ts',
  'flow-10-deadline.ts',
  'flow-12-13-franchise-publication.ts',
  'cross-rbac-sweep.ts',
  'cross-ws.ts',
  'cross-cron.ts',
  'cross-events.ts'
]

const main = async () => {
  console.log(`[flowtest] DATABASE_URL=${DATABASE_URL}`)
  console.log(`[flowtest] API=${API}`)

  // Probe server
  const probe = await fetch(`${API}/api-json`).catch(() => null)
  if (!probe || probe.status !== 200) {
    console.error(`[flowtest] Server chưa chạy ở ${API}.`)
    console.error('  1) pnpm build')
    console.error('  2) node --env-file=.env.flowtest dist/main.js')
    process.exit(2)
  }
  console.log('[flowtest] Server OK')

  // Parse --only=substring
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7)
  const selected = only ? FILES.filter((f) => f.includes(only)) : FILES
  if (only && selected.length === 0) {
    console.error(`[flowtest] --only=${only} không match file nào`)
    process.exit(2)
  }

  // Chạy tuần tự — mỗi file tự wipe/seed bên trong (xem runAll flow).
  // Runner CHỈ probe + dispatch — không wipe toàn cục (mỗi file flow chạy độc lập).
  const results: Array<{ file: string; code: number }> = []
  for (const f of selected) {
    console.log(`\n########## ${f} ##########`)
    const r = spawnSync('pnpm', ['flowtest:one', `test/flows/${f}`], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, DATABASE_URL, PORT: process.env.PORT ?? '4100' }
    })
    results.push({ file: f, code: r.status ?? 1 })
    if (r.status !== 0 && only) break // --only fail-fast để debug
  }

  console.log('\n================ TỔNG KẾT ================')
  for (const r of results) {
    console.log(`  ${r.code === 0 ? 'PASS' : 'FAIL'}  ${r.file}`)
  }
  process.exit(results.some((r) => r.code !== 0) ? 1 : 0)
}

void main().catch((e) => {
  console.error('[flowtest] FATAL', e)
  process.exit(2)
})
