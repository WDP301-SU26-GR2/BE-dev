// Spec 24 — test template + wiring của PDF hợp đồng.
//
// 🔴 GIỚI HẠN CÓ CHỦ ĐÍCH — ĐỌC TRƯỚC KHI SỬA:
// `@react-pdf/renderer@4` là package **pure ESM** (`"type": "module"`), ts-jest chạy CommonJS nên
// KHÔNG require được. Vì vậy `package.json` map nó sang `react-pdf-renderer.jest-mock.ts`.
// Hệ quả: ở tầng jest, `renderToBuffer` LUÔN trả buffer giả → **mọi assertion kiểu
// `expect(buffer).toStartWith('%PDF-')` ở đây là vô nghĩa** (nó khớp với mock, không phải PDF thật).
// Bản test cũ mắc đúng lỗi đó. File này thay bằng thứ jest KIỂM CHỨNG ĐƯỢC THẬT:
//   1. `ContractPdfDocument` là function component thuần → gọi trực tiếp, duyệt cây React element,
//      assert NỘI DUNG (nhãn tiếng Việt, tiền vi-VN, ngày quy đổi UTC+7, bảng điều kiện, chữ ký, footer).
//      Đây mới là thứ hay hỏng khi sửa template.
//   2. Service wiring: renderContractPdf đưa ĐÚNG component + data sang renderer.
//
// Bằng chứng render THẬT (bytes `%PDF-` từ R2) nằm ở:
//   - `test/flows/flow-06-contract-payment.ts` case F06-PDF-1b
//   - `scripts/smoke-spec24.mjs` phase S24-P2 (magic bytes + content-type + kích thước file)
// Đừng thêm assertion `%PDF-` vào file này nữa.
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import envConfig from 'src/core/config/envConfig'
import { ContractPdfDocument } from './contract-pdf.document'
import { PdfRenderService, type ContractPdfData } from './pdf-render.service'

const fullData: ContractPdfData = {
  id: 'c1',
  createdAt: '2026-07-19T00:00:00.000Z',
  contractType: 'REVENUE_SHARE',
  valuationAmount: 120_000_000,
  publisherOwnershipPct: 70,
  mangakaOwnershipPct: 30,
  terminationClause: 'Bồi thường 10% giá trị định giá',
  contractStart: '2026-01-01T00:00:00.000Z',
  contractEnd: null,
  status: 'FULLY_EXECUTED',
  // 03:00Z = 10:00 giờ VN — dùng để chứng minh quy đổi UTC+7 tại chỗ render.
  mangakaSignedAt: '2026-07-01T03:00:00.000Z',
  boardSignedAt: '2026-07-02T03:00:00.000Z',
  series: { id: 's1', title: 'Kiếm Sĩ Cà Chua', magazine: 'Weekly NOVA' },
  mangaka: { displayName: 'Tanaka Aoi' },
  editor: { displayName: 'Trần Biên Tập' },
  boardDecision: {
    decisionType: 'SERIALIZATION',
    result: 'APPROVED',
    decidedAt: '2026-06-30T03:00:00.000Z',
    boardSession: { title: 'Phiên serial hoá Q3', startTime: '2026-06-30T02:00:00.000Z' }
  },
  conditions: [
    {
      conditionType: 'RECURRING_CHAPTER',
      thresholdConfig: { everyNChapters: 5 },
      payoutAmount: 5_000_000,
      payoutPct: null,
      status: 'PENDING'
    }
  ],
  signatures: [{ displayName: 'Board A', signedAt: '2026-07-02T02:00:00.000Z' }],
  versionCount: 2,
  executedAmendmentCount: 0,
  latestAmendmentAt: null
}

/** Duyệt cây React element, gom mọi text hiển thị (children + prop `label`/`title`). */
const collectText = (node: unknown, out: string[] = []): string[] => {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out)
    return out
  }
  if (typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: Record<string, unknown> }).props ?? {}
    if (typeof props.label === 'string') out.push(props.label)
    if (typeof props.title === 'string') out.push(props.title)
    collectText(props.children, out)
  }
  return out
}

const renderText = (data: ContractPdfData) => collectText(ContractPdfDocument({ data })).join(' | ')

describe('ContractPdfDocument (Spec 24) — nội dung template', () => {
  it('dựng đủ 6 mục với nhãn tiếng Việt và dữ liệu hợp đồng', () => {
    const text = renderText(fullData)
    expect(text).toContain('HỢP ĐỒNG XUẤT BẢN TÁC PHẨM MANGA')
    expect(text).toContain(envConfig.NAME_APP)
    expect(text).toContain('c1')
    expect(text).toContain('1. Căn cứ')
    expect(text).toContain('2. Các bên')
    expect(text).toContain('3. Điều khoản chính')
    expect(text).toContain('4. Điều kiện thanh toán')
    expect(text).toContain('5. Điều khoản chấm dứt')
    expect(text).toContain('6. Chữ ký điện tử')
  })

  it('dịch enum sang nhãn tiếng Việt (không rò enum thô ra văn bản pháp lý)', () => {
    const text = renderText(fullData)
    expect(text).toContain('Chia sẻ doanh thu') // REVENUE_SHARE
    expect(text).toContain('Mốc chương lặp') // RECURRING_CHAPTER
    expect(renderText({ ...fullData, contractType: 'FULL_BUYOUT' })).toContain('Mua đứt toàn bộ quyền')
  })

  it('định dạng tiền theo vi-VN và diễn giải thresholdConfig', () => {
    const text = renderText(fullData)
    expect(text).toContain(`${(120_000_000).toLocaleString('vi-VN')} đ`)
    expect(text).toContain(`${(5_000_000).toLocaleString('vi-VN')} đ`)
    expect(text).toContain('Mỗi 5 chương')
  })

  it('quy đổi ngày sang giờ VN (UTC+7) tại chỗ render', () => {
    // mangakaSignedAt 03:00Z → 10:00 ICT. Nếu quên timeZone sẽ ra 03:00.
    expect(renderText(fullData)).toContain('10:00')
  })

  it('liệt kê từng chữ ký Hội đồng + căn cứ quyết định', () => {
    const text = renderText(fullData)
    expect(text).toContain('Board A')
    expect(text).toContain('Tanaka Aoi')
    expect(text).toContain('SERIALIZATION')
    expect(text).toContain('Phiên họp Hội đồng')
    expect(text).toContain('Phiên serial hoá Q3')
  })

  it('footer ghi phiên bản nội dung; KHÔNG nhắc phụ lục khi chưa có phụ lục nào', () => {
    const text = renderText(fullData)
    expect(text).toContain('Phiên bản nội dung: v')
    expect(text).not.toContain('Đã sửa đổi bởi')
  })

  it('footer nhắc số phụ lục đã thực thi khi có', () => {
    const text = renderText({
      ...fullData,
      executedAmendmentCount: 2,
      latestAmendmentAt: '2026-07-10T03:00:00.000Z'
    })
    expect(text).toContain('Đã sửa đổi bởi 2 phụ lục')
  })

  it('thiếu dữ liệu optional → rơi về dấu — thay vì undefined/crash', () => {
    const text = renderText({
      ...fullData,
      editor: null,
      terminationClause: null,
      contractEnd: null,
      valuationAmount: null,
      conditions: [],
      signatures: [],
      boardDecision: null
    })
    expect(text).toContain('Không có điều kiện thanh toán.')
    expect(text).toContain('—')
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('null')
  })
})

describe('PdfRenderService (Spec 24) — wiring', () => {
  beforeEach(() => jest.clearAllMocks())

  it('đưa đúng ContractPdfDocument + data sang renderer', async () => {
    await new PdfRenderService().renderContractPdf(fullData)
    expect(renderToBuffer).toHaveBeenCalledTimes(1)
    const element = (renderToBuffer as jest.Mock).mock.calls[0][0] as React.ReactElement
    expect(element.type).toBe(ContractPdfDocument)
    expect((element.props as { data: ContractPdfData }).data).toBe(fullData)
  })

  it('trả về Buffer cho caller', async () => {
    const buffer = await new PdfRenderService().renderContractPdf(fullData)
    expect(Buffer.isBuffer(buffer)).toBe(true)
  })
})
