// Parse a human-readable duration string (e.g. "5m", "30s", "1h", "7d") into milliseconds.
// Also accepts a plain integer string, interpreted as milliseconds.
// Throws on invalid input so a misconfigured env surfaces immediately (fail-fast).
const UNIT_TO_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000
}

export function parseDurationMs(input: string): number {
  const trimmed = input.trim()
  const match = /^(\d+)(ms|s|m|h|d)?$/.exec(trimmed)
  if (!match) {
    throw new Error(`Invalid duration string: "${input}" (expected e.g. "5m", "30s", "1h")`)
  }
  const value = Number(match[1])
  const unit = match[2] ?? 'ms'
  return value * UNIT_TO_MS[unit]
}
