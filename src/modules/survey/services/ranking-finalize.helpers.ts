// Pure helpers for finalizeRanking (Spec 5 §3-§4). NO I/O, no Prisma — testable in isolation.
// Kept intentionally tiny to encourage unit tests over integration coverage.

import { SeriesStatus } from '@prisma/client'

export type RiskLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'SEVERE'

// Requiment Flow 4: chỉ đánh giá "nguy cơ bị huỷ" cho bộ truyện còn đang chạy.
// - HIATUS: không có chương mới để bình chọn nên không bị coi là kém (Requiment §1.10).
// - CANCELLING/COMPLETING/CANCELLED/COMPLETED: số phận đã được Hội đồng chốt rồi — cảnh báo "nguy cơ bị huỷ"
//   là vô nghĩa. Trường hợp gặp thật: bộ truyện kết thúc GIỮA kỳ, mà `eligibleSeriesIds` là snapshot bất biến
//   từ lúc mở kỳ nên vẫn được xếp hạng lúc chốt.
export const RISK_EXCLUDED_SERIES_STATUSES: SeriesStatus[] = [
  SeriesStatus.HIATUS,
  SeriesStatus.CANCELLING,
  SeriesStatus.COMPLETING,
  SeriesStatus.CANCELLED,
  SeriesStatus.COMPLETED
]

// Bộ truyện có được đưa vào diện đánh giá nguy cơ không (status null = không tra được → cứ loại cho an toàn).
export function isRiskEvaluable(
  status: SeriesStatus | null | undefined,
  publishedChapters: number,
  minChapters: number
): boolean {
  if (publishedChapters < minChapters) return false
  if (!status) return false
  return !RISK_EXCLUDED_SERIES_STATUSES.includes(status)
}

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
