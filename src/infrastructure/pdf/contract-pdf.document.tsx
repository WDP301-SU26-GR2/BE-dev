import React from 'react'
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import envConfig from 'src/core/config/envConfig'
import type { ContractPdfData } from './pdf-render.service'
import {
  DASH,
  conditionLabel,
  conditionStatusLabel,
  contractTypeLabel,
  decisionResultLabel,
  decisionTypeLabel,
  fmtDate,
  fmtMoney,
  fmtTerminationClause,
  fmtThreshold,
  formatContractNo
} from './contract-pdf.helpers'

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingHorizontal: 42,
    paddingBottom: 44,
    fontFamily: 'Roboto',
    fontSize: 9,
    lineHeight: 1.4,
    color: '#1f2937'
  },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brand: { fontSize: 10, fontWeight: 700, color: '#111827' },
  brandMeta: { fontSize: 8, color: '#4b5563', textAlign: 'right' },
  title: { fontSize: 16, fontWeight: 700, textAlign: 'center', marginTop: 12, marginBottom: 2 },
  titleRule: {
    borderBottomWidth: 1.2,
    borderBottomColor: '#111827',
    width: 120,
    alignSelf: 'center',
    marginBottom: 12
  },
  preamble: { marginBottom: 6 },
  partyLine: { marginTop: 2 },
  partyLabel: { fontWeight: 700 },
  section: { marginTop: 10 },
  articleTitle: { fontSize: 10.5, fontWeight: 700, color: '#111827', marginBottom: 3 },
  row: { flexDirection: 'row', marginBottom: 2 },
  label: { width: '32%', fontWeight: 700 },
  value: { width: '68%' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#e5e7eb',
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontWeight: 700
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#d1d5db',
    paddingVertical: 4,
    paddingHorizontal: 4
  },
  colType: { width: '24%' },
  colThreshold: { width: '30%' },
  colAmount: { width: '20%' },
  colStatus: { width: '26%' },
  clauseText: { marginTop: 1 },
  twoCol: { flexDirection: 'row', marginTop: 8 },
  signCol: { width: '50%', paddingRight: 12 },
  signRole: { fontWeight: 700, marginBottom: 2 },
  signName: { marginTop: 2 },
  signMeta: { fontSize: 8, color: '#4b5563' },
  signLine: { borderTopWidth: 0.7, borderTopColor: '#9ca3af', marginTop: 22, paddingTop: 2, width: '82%' },
  signHint: { fontSize: 7.5, color: '#6b7280' },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 42,
    right: 42,
    fontSize: 7,
    color: '#4b5563',
    textAlign: 'center'
  }
})

const val = (value: string | number | null | undefined) => value ?? DASH

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value}>{children}</Text>
  </View>
)

export function ContractPdfDocument({ data }: { data: ContractPdfData }) {
  const publisher = envConfig.NAME_APP
  const contractNo = formatContractNo(data.id, data.createdAt)
  const latestAmendment = data.latestAmendmentAt ? fmtDate(data.latestAmendmentAt) : DASH
  const boardSignatures = data.signatures.filter((signature) => signature.role !== 'MANGAKA')

  const basis = data.boardDecision
    ? `${decisionTypeLabel(data.boardDecision.decisionType)} · ${decisionResultLabel(data.boardDecision.result)} · ${fmtDate(data.boardDecision.decidedAt)}`
    : DASH
  const session = data.boardDecision
    ? `${data.boardDecision.boardSession.title} · ${fmtDate(data.boardDecision.boardSession.startTime)}`
    : DASH

  return (
    <Document title={`Hợp đồng ${contractNo}`} author={publisher}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.brandRow}>
          <Text style={styles.brand}>NHÀ XUẤT BẢN {publisher.toUpperCase()}</Text>
          <Text style={styles.brandMeta}>
            Số HĐ: {contractNo}
            {'\n'}
            Ngày lập: {fmtDate(data.createdAt)}
          </Text>
        </View>
        <Text style={styles.title}>HỢP ĐỒNG XUẤT BẢN TÁC PHẨM MANGA</Text>
        <View style={styles.titleRule} />

        {/* Preamble */}
        <View style={styles.preamble}>
          <Text>
            Căn cứ Quyết định của Hội đồng biên tập ({basis}) tại phiên họp {session};
          </Text>
          <Text>Hôm nay, {fmtDate(data.createdAt)}, các bên gồm:</Text>
          <Text style={styles.partyLine}>
            <Text style={styles.partyLabel}>BÊN A (Nhà xuất bản): </Text>
            {publisher}
          </Text>
          <Text style={styles.partyLine}>
            <Text style={styles.partyLabel}>BÊN B (Tác giả): </Text>
            {data.mangaka.displayName}
          </Text>
          <Text style={styles.partyLine}>
            <Text style={styles.partyLabel}>Đại diện soạn thảo: </Text>
            {data.editor?.displayName ?? DASH}
          </Text>
          <Text style={styles.partyLine}>Hai bên thống nhất ký kết hợp đồng với các điều khoản sau:</Text>
        </View>

        {/* Điều 1 */}
        <View style={styles.section}>
          <Text style={styles.articleTitle}>Điều 1. Đối tượng hợp đồng</Text>
          <Field label="Tác phẩm">{data.series.title}</Field>
          <Field label="Tạp chí phát hành">{data.series.magazine ?? DASH}</Field>
        </View>

        {/* Điều 2 */}
        <View style={styles.section}>
          <Text style={styles.articleTitle}>Điều 2. Loại hợp đồng & tỷ lệ sở hữu</Text>
          <Field label="Loại hợp đồng">{contractTypeLabel[data.contractType] ?? data.contractType}</Field>
          <Field label="Giá trị định giá">{fmtMoney(data.valuationAmount)}</Field>
          <Field label="Tỷ lệ sở hữu">
            Nhà xuất bản {val(data.publisherOwnershipPct)}% · Tác giả {val(data.mangakaOwnershipPct)}%
          </Field>
        </View>

        {/* Điều 3 */}
        <View style={styles.section}>
          <Text style={styles.articleTitle}>Điều 3. Thời hạn hợp đồng</Text>
          <Field label="Hiệu lực từ">{fmtDate(data.contractStart)}</Field>
          <Field label="Đến hết">{fmtDate(data.contractEnd)}</Field>
        </View>

        {/* Điều 4 */}
        <View style={styles.section}>
          <Text style={styles.articleTitle}>Điều 4. Điều kiện thanh toán</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.colType}>Loại</Text>
            <Text style={styles.colThreshold}>Ngưỡng</Text>
            <Text style={styles.colAmount}>Giá trị</Text>
            <Text style={styles.colStatus}>Trạng thái</Text>
          </View>
          {data.conditions.length === 0 ? (
            <View style={styles.tableRow}>
              <Text>Không có điều kiện thanh toán kèm theo.</Text>
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
                <Text style={styles.colStatus}>{conditionStatusLabel(condition.status)}</Text>
              </View>
            ))
          )}
        </View>

        {/* Điều 5 */}
        <View style={styles.section}>
          <Text style={styles.articleTitle}>Điều 5. Điều khoản chấm dứt</Text>
          <Text style={styles.clauseText}>{fmtTerminationClause(data.terminationClause)}</Text>
        </View>

        {/* Điều 6 */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.articleTitle}>Điều 6. Chữ ký điện tử</Text>
          <View style={styles.twoCol}>
            <View style={styles.signCol}>
              <Text style={styles.signRole}>BÊN B — TÁC GIẢ</Text>
              <Text style={styles.signName}>{data.mangaka.displayName}</Text>
              <Text style={styles.signMeta}>Ký ngày: {fmtDate(data.mangakaSignedAt)}</Text>
              <Text style={styles.signHint}>Ký điện tử qua OTP email</Text>
              <View style={styles.signLine} />
            </View>
            <View style={styles.signCol}>
              <Text style={styles.signRole}>ĐẠI DIỆN NHÀ XUẤT BẢN / HỘI ĐỒNG</Text>
              {boardSignatures.length === 0 ? (
                <Text style={styles.signName}>{DASH}</Text>
              ) : (
                boardSignatures.map((signature, index) => (
                  <Text key={index} style={styles.signName}>
                    {signature.displayName}
                    <Text style={styles.signMeta}> · {fmtDate(signature.signedAt)}</Text>
                  </Text>
                ))
              )}
              <Text style={styles.signMeta}>Hoàn tất Hội đồng: {fmtDate(data.boardSignedAt)}</Text>
              <View style={styles.signLine} />
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          Phiên bản nội dung: v{data.versionCount}.{' '}
          {data.executedAmendmentCount > 0
            ? `Đã sửa đổi bởi ${data.executedAmendmentCount} phụ lục, gần nhất ${latestAmendment}. `
            : ''}
          Văn bản sinh tự động từ hệ thống {publisher} — bản ghi hệ thống là căn cứ đối chiếu. Mã hệ thống: {data.id}.
        </Text>
      </Page>
    </Document>
  )
}
