import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const registryPath = resolve(root, 'ops/security/risk-acceptances.json')
const fixtures = resolve(root, 'test/supply-chain/fixtures')

const fail = (message) => {
  throw new Error(`[security-policy] ${message}`)
}

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`cannot parse ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const nonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0

function validateRiskRegistry(path) {
  const registry = readJson(path)
  if (registry?.schemaVersion !== 1 || !Array.isArray(registry.acceptances)) {
    fail('risk registry must have schemaVersion=1 and an acceptances array')
  }
  const registryKeys = Object.keys(registry)
  if (registryKeys.length !== 2 || !registryKeys.includes('schemaVersion') || !registryKeys.includes('acceptances')) {
    fail('risk registry contains unsupported top-level fields')
  }

  const today = new Date().toISOString().slice(0, 10)
  const ids = new Set()
  for (const [index, acceptance] of registry.acceptances.entries()) {
    const label = `acceptances[${index}]`
    const keys = new Set(Object.keys(acceptance ?? {}))
    const expected = new Set([
      'id',
      'findingId',
      'scope',
      'rationale',
      'compensatingControls',
      'owner',
      'approvedBy',
      'expiresOn'
    ])
    if ([...keys].some((key) => !expected.has(key)) || [...expected].some((key) => !keys.has(key))) {
      fail(`${label} does not match the required schema`)
    }
    if (!/^RA-[0-9]{4}-[0-9]{3,}$/.test(acceptance.id)) fail(`${label}.id is invalid`)
    if (ids.has(acceptance.id)) fail(`${label}.id is duplicated`)
    ids.add(acceptance.id)
    for (const field of ['findingId', 'scope', 'rationale', 'owner', 'approvedBy']) {
      if (!nonEmptyString(acceptance[field])) fail(`${label}.${field} must be non-empty`)
    }
    if (!/^target=[^;]+;package=.+$/.test(acceptance.scope)) {
      fail(`${label}.scope must use target=<Trivy target>;package=<package name>`)
    }
    if (
      !Array.isArray(acceptance.compensatingControls) ||
      acceptance.compensatingControls.length === 0 ||
      acceptance.compensatingControls.some((control) => !nonEmptyString(control))
    ) {
      fail(`${label}.compensatingControls must contain non-empty controls`)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(acceptance.expiresOn)) fail(`${label}.expiresOn must be YYYY-MM-DD`)
    const expiry = new Date(`${acceptance.expiresOn}T00:00:00.000Z`)
    if (Number.isNaN(expiry.valueOf()) || expiry.toISOString().slice(0, 10) !== acceptance.expiresOn) {
      fail(`${label}.expiresOn is not a real calendar date`)
    }
    if (acceptance.expiresOn < today) fail(`${label} expired on ${acceptance.expiresOn}`)
  }
  return registry
}

const findingScope = (target, packageName) => `target=${target};package=${packageName}`

function validateTrivyReport(path, acceptancePath = registryPath) {
  const report = readJson(path)
  if (!Array.isArray(report?.Results)) fail('Trivy report must contain Results[]')
  const registry = validateRiskRegistry(acceptancePath)
  const accepted = new Set(registry.acceptances.map((entry) => `${entry.findingId}|${entry.scope}`))
  const blocking = report.Results.flatMap((result) =>
    (Array.isArray(result?.Vulnerabilities) ? result.Vulnerabilities : [])
      .filter((finding) => ['HIGH', 'CRITICAL'].includes(String(finding?.Severity).toUpperCase()))
      .filter((finding) => {
        const findingId = String(finding?.VulnerabilityID ?? 'unknown')
        const packageName = String(finding?.PkgName ?? 'unknown')
        const hasFix = nonEmptyString(finding?.FixedVersion)
        return hasFix || !accepted.has(`${findingId}|${findingScope(String(result?.Target ?? 'unknown'), packageName)}`)
      })
      .map(
        (finding) =>
          `${finding.VulnerabilityID ?? 'unknown'}:${finding.PkgName ?? 'unknown'}` +
          (nonEmptyString(finding?.FixedVersion) ? ` (fix ${finding.FixedVersion})` : '')
      )
  )
  if (blocking.length > 0) {
    fail(`Trivy report contains blocking High/Critical findings: ${blocking.join(', ')}`)
  }
}

function expectRejected(command, path) {
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), command, path], {
    cwd: root,
    encoding: 'utf8'
  })
  if (result.status === 0) fail(`${command} unexpectedly accepted negative fixture ${path}`)
}

function selfTest() {
  validateRiskRegistry(registryPath)
  validateRiskRegistry(resolve(root, 'ops/security/risk-acceptances.example.json'))
  validateTrivyReport(resolve(fixtures, 'trivy-clean.json'))
  validateTrivyReport(
    resolve(fixtures, 'trivy-accepted-unfixed.json'),
    resolve(root, 'ops/security/risk-acceptances.example.json')
  )
  expectRejected('validate-risk', resolve(fixtures, 'expired-risk-acceptances.json'))
  expectRejected('validate-trivy', resolve(fixtures, 'trivy-high.json'))
}

const [command, path, acceptancePath] = process.argv.slice(2)
try {
  if (command === 'validate-risk') validateRiskRegistry(resolve(path ?? registryPath))
  else if (command === 'validate-trivy') {
    validateTrivyReport(resolve(path ?? ''), resolve(acceptancePath ?? registryPath))
  } else if (command === 'self-test') selfTest()
  else fail('usage: validate-risk [path] | validate-trivy <report> | self-test')
  console.log(`[security-policy] ${command} passed`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
