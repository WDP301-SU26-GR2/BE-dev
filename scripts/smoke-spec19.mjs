import { spawnSync } from 'node:child_process'

const rounds = 2
const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm'
const commandPrefix = process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm.cmd'] : []

for (let round = 1; round <= rounds; round += 1) {
  console.log(`[smoke-spec19] round ${round}/${rounds}: authoritative lifecycle flow`)
  const result = spawnSync(command, [...commandPrefix, 'flowtest', '--', '--only=flow-02'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  })

  if (result.status !== 0) {
    console.error(`[smoke-spec19] round ${round} failed with exit code ${result.status ?? 1}`)
    process.exit(result.status ?? 1)
  }
}

console.log('[smoke-spec19] PASS: 2/2 rounds')
