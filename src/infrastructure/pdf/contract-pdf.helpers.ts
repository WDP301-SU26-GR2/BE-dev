/**
 * Pure formatting helpers for the contract PDF document.
 * Kept free of JSX / react-pdf so they can be unit-tested without rendering.
 */

export const DASH = '—'

export const contractTypeLabel: Record<string, string> = {
  FULL_BUYOUT: 'Mua đứt toàn bộ quyền',
  REVENUE_SHARE: 'Chia sẻ doanh thu'
}

export const conditionLabel: Record<string, string> = {
  CHAPTER_MILESTONE: 'Mốc chương',
  RECURRING_CHAPTER: 'Mốc chương lặp',
  RANKING_MILESTONE: 'Mốc xếp hạng',
  TIME_BOUND: 'Theo thời hạn'
}

const decisionTypeMap: Record<string, string> = {
  CONTINUE: 'Giữ series',
  CANCEL: 'Hủy series',
  CANCELLATION: 'Hủy series',
  HIATUS: 'Tạm ngưng',
  ENDING_ALLOWANCE: 'Cấp chương kết',
  SERIES_CONTRACT_APPROVAL: 'Duyệt hợp đồng',
  SERIALIZATION: 'Serial hóa',
  FORMAT_CHANGE: 'Đổi hình thức xuất bản',
  COMPLETION: 'Kết thúc series',
  REPRINT: 'Tái bản',
  TRANSFER: 'Chuyển nhượng',
  CONTRACT: 'Hợp đồng'
}

const decisionResultMap: Record<string, string> = {
  PENDING: 'Đang chờ',
  PENDING_QUORUM: 'Chờ đủ số phiếu',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
  EXPIRED: 'Hết hiệu lực'
}

const conditionStatusMap: Record<string, string> = {
  PENDING: 'Chờ đạt',
  ACHIEVED: 'Đã đạt',
  PAID: 'Đã chi trả',
  CANCELLED: 'Đã hủy',
  MISSED: 'Bỏ lỡ',
  DISABLED: 'Vô hiệu'
}

/** Map an enum value to its Vietnamese label; unknown values fall through unchanged, null → dash. */
const labelOf =
  (map: Record<string, string>) =>
  (value: string | null | undefined): string => {
    if (value == null) return DASH
    return map[value] ?? value
  }

export const decisionTypeLabel = labelOf(decisionTypeMap)
export const decisionResultLabel = labelOf(decisionResultMap)
export const conditionStatusLabel = (value: string | null | undefined): string =>
  value == null ? DASH : (conditionStatusMap[value] ?? value)

/** YYYYMMDD in Vietnam time (so it matches the displayed "Ngày lập"). */
const yyyymmdd = (iso: string): string => {
  const parsed = new Date(iso)
  const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  // en-CA formats as YYYY-MM-DD, which we strip to digits.
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(base)
  return formatted.replace(/-/g, '')
}

/** Human-readable contract number derived from id + createdAt (no schema field needed). */
export const formatContractNo = (id: string, createdAt: string): string =>
  `HĐXB-${yyyymmdd(createdAt)}-${id.slice(-6).toUpperCase()}`

export const fmtMoney = (amount: number | null): string =>
  amount === null ? DASH : `${amount.toLocaleString('vi-VN')} đ`

export const fmtDate = (iso: string | null): string => {
  if (!iso) return DASH
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return DASH
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh'
  }).format(date)
}

/**
 * Converts the persisted PaymentCondition threshold JSON into legal-reader text.
 * Payment validation accepts the short keys (`chapter`, `every`, `topRank`, `deadline`);
 * long keys remain supported only to keep previously exported/migrated data readable.
 */
export const fmtThreshold = (config: unknown): string => {
  if (!config) return DASH
  if (typeof config === 'object') {
    const item = config as Record<string, unknown>
    if (typeof item.every === 'number') return `Mỗi ${item.every} chương`
    if (typeof item.chapter === 'number') return `Chương ${item.chapter}`
    if (typeof item.topRank === 'number') return `Đạt Top ${item.topRank}`
    if (typeof item.deadline === 'string') return `Ngày ${item.deadline}`
    if (typeof item.description === 'string' && item.description.trim()) return item.description

    // Legacy aliases from the first PDF template; no new API may write these keys.
    if (typeof item.everyNChapters === 'number') return `Mỗi ${item.everyNChapters} chương`
    if (typeof item.chapterNumber === 'number') return `Chương ${item.chapterNumber}`
    if (typeof item.rank === 'number') return `Đạt Top ${item.rank}`
    if (typeof item.date === 'string') return `Ngày ${item.date}`
  }
  try {
    return JSON.stringify(config)
  } catch {
    return DASH
  }
}

/**
 * terminationClause is free contract text. Older clients accidentally serialized a
 * structured clause (JSON) or a `key:value` shorthand into this string field, so turn
 * the known shapes into readable Vietnamese while preserving unknown clauses verbatim.
 */
export const fmtTerminationClause = (clause: string | null): string => {
  const text = clause?.trim()
  if (!text) return DASH

  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const item = parsed as Record<string, unknown>
      const parts: string[] = []
      if (typeof item.compensationPct === 'number') {
        parts.push(`Mức bồi thường: ${item.compensationPct}% giá trị định giá.`)
      }
      if (typeof item.policy === 'string' && item.policy.trim()) parts.push(item.policy.trim())
      return parts.length > 0 ? parts.join(' ') : text
    }
  } catch {
    // not JSON — fall through
  }

  // Shorthand like "compensation:100" → treat the number as a compensation percentage.
  const shorthand = /^compensation\s*:\s*(\d+)$/i.exec(text)
  if (shorthand) return `Mức bồi thường: ${shorthand[1]}% giá trị định giá.`

  return text
}
