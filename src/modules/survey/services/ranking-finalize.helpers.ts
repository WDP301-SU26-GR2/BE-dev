// Pure helpers for finalizeRanking (Spec 5 §3-§4). NO I/O, no Prisma — testable in isolation.
// Kept intentionally tiny to encourage unit tests over integration coverage.

export type RiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'SEVERE'

// Nhóm nguy cơ = ceil(N/3) series xếp cuối. N=0 → 0 (an toàn cho kỳ rỗng).
export function bottomThirdCount(totalSeries: number): number {
  return Math.ceil(totalSeries / 3)
}

// Requiment Flow 4: !atRisk→NONE; ≥5 kỳ liên tiếp→SEVERE; ≥3 kỳ→MEDIUM; else LOW.
export function computeRiskLevel(isAtRisk: boolean, consecutiveCount: number): RiskLevel {
  if (!isAtRisk) return 'NONE'
  if (consecutiveCount >= 5) return 'SEVERE'
  if (consecutiveCount >= 3) return 'MEDIUM'
  return 'LOW'
}

// at-risk → prev+1; ngược lại (kể cả loại trừ: <8 chương / HIATUS) → reset 0 (Spec 5 §3 "reset" rule).
// Resume sau hiatus xây streak mới — đúng tinh thần "hiatus không bị ảnh hưởng tiêu cực".
export function nextConsecutiveCount(previousCount: number, isAtRisk: boolean): number {
  return isAtRisk ? previousCount + 1 : 0
}
