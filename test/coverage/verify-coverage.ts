import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type MetricName = 'statements' | 'branches' | 'functions' | 'lines'
type Counter = { covered: number; total: number }
type MetricCounters = Record<MetricName, Counter>

type FileCoverage = {
  statementMap: Record<string, { start: { line: number } }>
  s: Record<string, number>
  f: Record<string, number>
  b: Record<string, number[]>
}

type Baseline = {
  global: Record<MetricName, number>
  criticalBranch: Record<string, number>
  targets: {
    global: Pick<Record<MetricName, number>, 'statements' | 'branches'>
    criticalBranch: number
    changedLines: number
  }
}

const ROOT = resolve(__dirname, '../..')
const coverage = JSON.parse(readFileSync(resolve(ROOT, 'coverage/coverage-final.json'), 'utf8')) as Record<
  string,
  FileCoverage
>
const baseline = JSON.parse(readFileSync(resolve(__dirname, 'coverage-baseline.json'), 'utf8')) as Baseline

const criticalSlices: Record<string, (path: string) => boolean> = {
  transfer: (path) => path.includes('/src/modules/transfer/'),
  reprint: (path) => path.includes('/src/modules/reprint/'),
  guestVote: (path) =>
    [
      '/src/modules/survey/services/guest-email-otp-delivery.service.ts',
      '/src/modules/survey/services/guest-vote.service.ts',
      '/src/modules/survey/services/survey-otp-request.service.ts',
      '/src/modules/survey/services/survey-otp.service.ts',
      '/src/modules/survey/vote-otp.repo.ts'
    ].some((suffix) => path.endsWith(suffix)),
  contract: (path) => path.includes('/src/modules/contract/'),
  payment: (path) => path.includes('/src/modules/payment/')
}

const delegationFacades = new Set([
  'src/modules/chapter/chapter.repo.ts',
  'src/modules/payment/payment.repo.ts',
  'src/modules/series/series.repo.ts',
  'src/modules/survey/survey.repo.ts',
  'src/modules/task/task.repo.ts',
  'src/modules/users/users.repo.ts'
])

function isChangedLineCoverageEligible(path: string): boolean {
  return (
    !path.startsWith('src/initialScript/') &&
    !path.endsWith('.module.ts') &&
    !path.endsWith('.facade.ts') &&
    !delegationFacades.has(path)
  )
}

function emptyCounters(): MetricCounters {
  return {
    statements: { covered: 0, total: 0 },
    branches: { covered: 0, total: 0 },
    functions: { covered: 0, total: 0 },
    lines: { covered: 0, total: 0 }
  }
}

function addHits(counter: Counter, hits: number[]): void {
  counter.covered += hits.filter((hit) => hit > 0).length
  counter.total += hits.length
}

function summarize(predicate: (path: string) => boolean): MetricCounters {
  const result = emptyCounters()

  for (const [rawPath, file] of Object.entries(coverage)) {
    const path = rawPath.replaceAll('\\', '/')
    if (!predicate(path) || path.endsWith('.spec.ts')) continue

    addHits(result.statements, Object.values(file.s))
    addHits(result.functions, Object.values(file.f))
    addHits(result.branches, Object.values(file.b).flat())

    const lineHits = new Map<number, number>()
    for (const [statementId, location] of Object.entries(file.statementMap)) {
      const line = location.start.line
      lineHits.set(line, (lineHits.get(line) ?? 0) + (file.s[statementId] ?? 0))
    }
    addHits(result.lines, [...lineHits.values()])
  }

  return result
}

function percentage(counter: Counter): number {
  if (counter.total === 0) return 0
  return Math.floor((counter.covered / counter.total) * 10_000) / 100
}

function format(counter: Counter): string {
  return `${percentage(counter).toFixed(2)}% (${counter.covered}/${counter.total})`
}

function normalizePath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .replace(/^[A-Za-z]:/, '')
    .replace(/^\/+/, '')
}

function changedProductionLines(): Map<string, Set<number>> {
  const dirtySource = execFileSync('git', ['status', '--porcelain', '--', 'src'], {
    cwd: ROOT,
    encoding: 'utf8'
  }).trim()
  const base = process.env.COVERAGE_BASE_REF?.trim() || (dirtySource ? 'HEAD' : 'HEAD^')
  const comparison = base === 'HEAD' ? 'HEAD' : `${base}...HEAD`
  const diff = execFileSync(
    'git',
    ['diff', '--unified=0', '--no-ext-diff', '--diff-filter=ACMRT', comparison, '--', 'src'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  )
  const changed = new Map<string, Set<number>>()
  let currentPath: string | null = null

  for (const line of diff.split(/\r?\n/)) {
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/)
    if (fileMatch) {
      currentPath = normalizePath(fileMatch[1])
      continue
    }

    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (!currentPath || !hunkMatch) continue
    const start = Number(hunkMatch[1])
    const count = hunkMatch[2] === undefined ? 1 : Number(hunkMatch[2])
    const lines = changed.get(currentPath) ?? new Set<number>()
    for (let offset = 0; offset < count; offset += 1) lines.add(start + offset)
    changed.set(currentPath, lines)
  }

  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'src'], {
    cwd: ROOT,
    encoding: 'utf8'
  })
  for (const rawPath of untracked.split(/\r?\n/).filter(Boolean)) {
    const path = normalizePath(rawPath)
    const source = readFileSync(resolve(ROOT, path), 'utf8')
    changed.set(path, new Set(source.split(/\r?\n/).map((_, index) => index + 1)))
  }

  return changed
}

function summarizeChangedLines(): {
  total: Counter
  files: Array<{ path: string; counter: Counter }>
  hasChangedSourceFiles: boolean
} {
  const changed = changedProductionLines()
  const total: Counter = { covered: 0, total: 0 }
  const files: Array<{ path: string; counter: Counter }> = []

  for (const [rawPath, file] of Object.entries(coverage)) {
    const normalized = normalizePath(rawPath)
    const srcIndex = normalized.lastIndexOf('src/')
    if (srcIndex < 0) continue
    const path = normalized.slice(srcIndex)
    if (path.endsWith('.spec.ts')) continue
    if (!isChangedLineCoverageEligible(path)) continue
    const changedLines = changed.get(path)
    if (!changedLines) continue

    const counter: Counter = { covered: 0, total: 0 }
    const hitsByLine = new Map<number, number>()
    for (const [statementId, location] of Object.entries(file.statementMap)) {
      const line = location.start.line
      hitsByLine.set(line, (hitsByLine.get(line) ?? 0) + (file.s[statementId] ?? 0))
    }
    for (const line of changedLines) {
      const hits = hitsByLine.get(line)
      if (hits === undefined) continue
      counter.total += 1
      if (hits > 0) counter.covered += 1
    }
    if (counter.total > 0) files.push({ path, counter })
    total.covered += counter.covered
    total.total += counter.total
  }

  const hasChangedSourceFiles = [...changed.keys()].some(
    (path) => !path.endsWith('.spec.ts') && isChangedLineCoverageEligible(path)
  )
  return { total, files, hasChangedSourceFiles }
}

const failures: string[] = []
const global = summarize((path) => path.includes('/src/'))

console.log('Coverage non-regression gate')
for (const metric of Object.keys(baseline.global) as MetricName[]) {
  const actual = percentage(global[metric])
  const required = baseline.global[metric]
  console.log(`  global ${metric}: ${format(global[metric])} (baseline ${required.toFixed(2)}%)`)
  if (actual < required) {
    failures.push(`global ${metric}: ${actual.toFixed(2)}% < ${required.toFixed(2)}%`)
  }
  const target = baseline.targets.global[metric as 'statements' | 'branches']
  if (target !== undefined && actual < target) {
    failures.push(`global ${metric}: ${actual.toFixed(2)}% < target ${target.toFixed(2)}%`)
  }
}

for (const [name, predicate] of Object.entries(criticalSlices)) {
  const counters = summarize(predicate)
  const actual = percentage(counters.branches)
  const required = baseline.criticalBranch[name]

  if (required === undefined) {
    failures.push(`critical slice "${name}" has no committed baseline`)
    continue
  }
  if (counters.branches.total === 0) {
    failures.push(`critical slice "${name}" matched no branch data`)
    continue
  }

  console.log(
    `  critical ${name} branches: ${format(counters.branches)} ` +
      `(baseline ${required.toFixed(2)}%, target ${baseline.targets.criticalBranch.toFixed(2)}%)`
  )
  if (actual < required) {
    failures.push(`critical ${name} branches: ${actual.toFixed(2)}% < ${required.toFixed(2)}%`)
  }
  if (actual < baseline.targets.criticalBranch) {
    failures.push(
      `critical ${name} branches: ${actual.toFixed(2)}% < target ${baseline.targets.criticalBranch.toFixed(2)}%`
    )
  }
}

const changedLineSummary = summarizeChangedLines()
const changedLines = changedLineSummary.total
const changedLinesActual = percentage(changedLines)
console.log(
  `  changed production lines: ${format(changedLines)} ` + `(target ${baseline.targets.changedLines.toFixed(2)}%)`
)
for (const file of changedLineSummary.files
  .filter(({ counter }) => percentage(counter) < baseline.targets.changedLines)
  .sort((left, right) => right.counter.total - right.counter.covered - (left.counter.total - left.counter.covered))
  .slice(0, 40)) {
  console.log(`    ${file.path}: ${format(file.counter)}`)
}
if (changedLines.total === 0 && !changedLineSummary.hasChangedSourceFiles) {
  console.log('  changed-lines gate skipped: no source files changed')
}
if (changedLines.total === 0 && changedLineSummary.hasChangedSourceFiles) {
  failures.push('changed production lines: no executable changed lines matched coverage data')
} else if (changedLines.total > 0 && changedLinesActual < baseline.targets.changedLines) {
  failures.push(
    `changed production lines: ${changedLinesActual.toFixed(2)}% < target ${baseline.targets.changedLines.toFixed(2)}%`
  )
}

if (failures.length > 0) {
  console.error('Coverage regressed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exitCode = 1
}
