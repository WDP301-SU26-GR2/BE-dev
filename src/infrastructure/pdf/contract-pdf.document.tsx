import React from 'react'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import envConfig from 'src/core/config/envConfig'
import type { ContractPdfData } from './pdf-render.service'

const DASH = '—'

const contractTypeLabel: Record<string, string> = {
  FULL_BUYOUT: 'Mua đứt toàn bộ quyền',
  REVENUE_SHARE: 'Chia sẻ doanh thu'
}

const conditionLabel: Record<string, string> = {
  CHAPTER_MILESTONE: 'Mốc chương',
  RECURRING_CHAPTER: 'Mốc chương lặp',
  RANKING_MILESTONE: 'Mốc xếp hạng',
  TIME_BOUND: 'Theo thời hạn'
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingHorizontal: 38,
    paddingBottom: 40,
    fontFamily: 'Roboto',
    fontSize: 9,
    color: '#1f2937'
  },
  title: { fontSize: 16, fontWeight: 700, textAlign: 'center', marginTop: 8, marginBottom: 4 },
  subtitle: { textAlign: 'center', marginBottom: 14 },
  section: { marginTop: 10 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: '#111827', marginBottom: 4 },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: '34%', fontWeight: 700 },
  value: { width: '66%' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#e5e7eb', padding: 4, fontWeight: 700 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#d1d5db', padding: 4 },
  colType: { width: '22%' },
  colThreshold: { width: '30%' },
  colAmount: { width: '20%' },
  colStatus: { width: '28%' },
  signature: { marginTop: 4, paddingLeft: 8 },
  footer: { position: 'absolute', bottom: 18, left: 38, right: 38, fontSize: 7, color: '#4b5563', textAlign: 'center' }
})

const val = (value: string | number | null | undefined) => value ?? DASH

const fmtMoney = (amount: number | null) => (amount === null ? DASH : `${amount.toLocaleString('vi-VN')} đ`)

const fmtDate = (iso: string | null) => {
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
 * Payment validation accepts the short keys (`chapter`, `every`, `topRank`, `deadline`).
 * The long keys remain supported only to keep previously exported/migrated data readable.
 */
const fmtThreshold = (config: unknown) => {
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
 * terminationClause is contract text. Older clients accidentally serialized a
 * structured clause into this string field, so turn the known legacy shape
 * into readable text while preserving an unknown clause verbatim.
 */
const fmtTerminationClause = (clause: string | null) => {
  if (!clause?.trim()) return DASH
  try {
    const parsed: unknown = JSON.parse(clause)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return clause

    const item = parsed as Record<string, unknown>
    const parts: string[] = []
    if (typeof item.compensationPct === 'number') {
      parts.push(`Mức bồi thường: ${item.compensationPct}% giá trị định giá.`)
    }
    if (typeof item.policy === 'string' && item.policy.trim()) parts.push(item.policy.trim())
    return parts.length > 0 ? parts.join(' ') : clause
  } catch {
    return clause
  }
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{children}</Text>
  </View>
)

export function ContractPdfDocument({ data }: { data: ContractPdfData }) {
  const publisher = envConfig.NAME_APP
  const latestAmendment = data.latestAmendmentAt ? fmtDate(data.latestAmendmentAt) : DASH
  const boardSignatures = data.signatures.filter((signature) => signature.role !== 'MANGAKA')

  return (
    <Document title={`Hợp đồng ${data.id}`} author={publisher}>
      <Page size="A4" style={styles.page}>
        <Text>{publisher}</Text>
        <Text style={styles.title}>HỢP ĐỒNG XUẤT BẢN TÁC PHẨM MANGA</Text>
        <Text style={styles.subtitle}>
          Số hợp đồng: {data.id} · Ngày lập: {fmtDate(data.createdAt)}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Căn cứ</Text>
          <Field label="Quyết định Hội đồng">
            {data.boardDecision
              ? `${val(data.boardDecision.decisionType)} · ${val(data.boardDecision.result)} · ${fmtDate(data.boardDecision.decidedAt)}`
              : DASH}
          </Field>
          <Field label="Phiên họp Hội đồng">
            {data.boardDecision
              ? `${data.boardDecision.boardSession.title} · ${fmtDate(data.boardDecision.boardSession.startTime)}`
              : DASH}
          </Field>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Các bên</Text>
          <Field label="Bên A">Nhà xuất bản {publisher}</Field>
          <Field label="Bên B">Mangaka: {data.mangaka.displayName}</Field>
          <Field label="Đại diện soạn thảo">{data.editor?.displayName ?? DASH}</Field>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Điều khoản chính</Text>
          <Field label="Tác phẩm">
            {data.series.title} ({data.series.magazine ?? DASH})
          </Field>
          <Field label="Loại hợp đồng">{contractTypeLabel[data.contractType] ?? data.contractType}</Field>
          <Field label="Định giá">{fmtMoney(data.valuationAmount)}</Field>
          <Field label="Tỷ lệ sở hữu">
            NXB: {val(data.publisherOwnershipPct)}% · Mangaka: {val(data.mangakaOwnershipPct)}%
          </Field>
          <Field label="Thời hạn">
            {fmtDate(data.contractStart)} → {fmtDate(data.contractEnd)}
          </Field>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Điều kiện thanh toán</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.colType}>Loại</Text>
            <Text style={styles.colThreshold}>Ngưỡng</Text>
            <Text style={styles.colAmount}>Giá trị</Text>
            <Text style={styles.colStatus}>Trạng thái</Text>
          </View>
          {data.conditions.length === 0 ? (
            <View style={styles.tableRow}>
              <Text>Không có điều kiện thanh toán.</Text>
            </View>
          ) : (
            data.conditions.map((condition, index) => (
              <View style={styles.tableRow} key={index}>
                <Text style={styles.colType}>{conditionLabel[condition.conditionType] ?? condition.conditionType}</Text>
                <Text style={styles.colThreshold}>{fmtThreshold(condition.thresholdConfig)}</Text>
                <Text style={styles.colAmount}>
                  {condition.payoutAmount !== null
                    ? fmtMoney(condition.payoutAmount)
                    : condition.payoutPct !== null
                      ? `${condition.payoutPct}%`
                      : DASH}
                </Text>
                <Text style={styles.colStatus}>{condition.status}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Điều khoản chấm dứt</Text>
          <Text>{fmtTerminationClause(data.terminationClause)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. Chữ ký điện tử</Text>
          <Field label="Mangaka">
            {data.mangaka.displayName} · {fmtDate(data.mangakaSignedAt)} · Ký điện tử qua OTP email
          </Field>
          <Text style={styles.label}>Hội đồng</Text>
          {boardSignatures.length === 0 ? (
            <Text style={styles.signature}>{DASH}</Text>
          ) : (
            boardSignatures.map((signature, index) => (
              <Text key={index} style={styles.signature}>
                {signature.displayName} · {fmtDate(signature.signedAt)}
              </Text>
            ))
          )}
          <Field label="Hoàn tất Hội đồng">{fmtDate(data.boardSignedAt)}</Field>
        </View>

        <Text style={styles.footer}>
          Phiên bản nội dung: v{data.versionCount}.{' '}
          {data.executedAmendmentCount > 0
            ? `Đã sửa đổi bởi ${data.executedAmendmentCount} phụ lục, gần nhất ${latestAmendment}. `
            : ''}
          Văn bản sinh tự động từ hệ thống {publisher} — bản ghi hệ thống là căn cứ đối chiếu.
        </Text>
      </Page>
    </Document>
  )
}
