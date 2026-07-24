import { spawnSync } from 'node:child_process'

// The flow itself seeds, probes real MongoDB state, and wipes all test data.
// Running it twice catches leaked state and makes this smoke check idempotent.
const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm'
const prefix = process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm.cmd'] : []

for (let round = 1; round <= 2; round += 1) {
  console.log(`[smoke-admin-hardening] round ${round}/2`)
  const result = spawnSync(command, [...prefix, 'flowtest', '--', '--only=flow-01-admin-hardening'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

console.log('[smoke-admin-hardening] PASS: 2/2 rounds')
