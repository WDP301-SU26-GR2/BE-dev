import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = dirname(fileURLToPath(import.meta.url))
const composeFile = resolve(directory, 'immutable-rollback.compose.yml')
const dockerfile = resolve(directory, 'rollback-fixture.Dockerfile')
const project = `mangaka-rollback-${process.pid}-${Date.now()}`
const createdImages = []

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: directory,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: { ...process.env, ...options.env }
  })
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
  return result
}

const output = (command, args, options = {}) => {
  const result = run(command, args, { ...options, capture: true })
  return result.stdout.trim()
}

const compose = (args, image, options = {}) =>
  run('docker', ['compose', '-p', project, '-f', composeFile, ...args], {
    ...options,
    env: { DRILL_IMAGE: image, ...options.env }
  })

const containerId = (image) =>
  output('docker', ['compose', '-p', project, '-f', composeFile, 'ps', '-q', 'app'], {
    env: { DRILL_IMAGE: image }
  })

const waitForHealth = async (image, expected) => {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const id = containerId(image)
    if (id) {
      const status = output('docker', [
        'inspect',
        '--format',
        '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}',
        id
      ])
      if (status === expected) return id
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500))
  }
  throw new Error(`fixture did not become ${expected}`)
}

const buildFixture = (release, healthy) => {
  const image = output('docker', [
    'build',
    '--quiet',
    '--file',
    dockerfile,
    '--build-arg',
    `RELEASE=${release}`,
    '--build-arg',
    `HEALTHY=${healthy}`,
    directory
  ])
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) {
    throw new Error(`fixture ${release} did not produce an immutable SHA256 image ID`)
  }
  createdImages.push(image)
  return image
}

try {
  const imageA = buildFixture('A', 'true')
  const imageB = buildFixture('B', 'false')

  compose(['up', '-d', '--force-recreate', 'app'], imageA)
  let id = await waitForHealth(imageA, 'healthy')
  if (output('docker', ['inspect', '--format', '{{.Image}}', id]) !== imageA) {
    throw new Error('healthy release A is not running from its immutable image ID')
  }

  compose(['up', '-d', '--force-recreate', 'app'], imageB)
  id = await waitForHealth(imageB, 'unhealthy')
  if (output('docker', ['inspect', '--format', '{{.Image}}', id]) !== imageB) {
    throw new Error('unhealthy release B was not actually deployed')
  }

  compose(['up', '-d', '--force-recreate', 'app'], imageA)
  id = await waitForHealth(imageA, 'healthy')
  const restoredRelease = output('docker', ['exec', id, 'cat', '/release'])
  if (restoredRelease !== 'A' || output('docker', ['inspect', '--format', '{{.Image}}', id]) !== imageA) {
    throw new Error('rollback did not restore immutable release A')
  }

  console.log('[rollback-drill] unhealthy B restored immutable release A')
} finally {
  run('docker', ['compose', '-p', project, '-f', composeFile, 'down', '--volumes', '--remove-orphans'], {
    env: { DRILL_IMAGE: createdImages[0] ?? 'busybox:1.37' },
    allowFailure: true
  })
  if (createdImages.length > 0) {
    run('docker', ['image', 'rm', ...new Set(createdImages)], { allowFailure: true })
  }
}
