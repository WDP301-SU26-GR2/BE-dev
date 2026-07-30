import {
  BoardConfigResSchema,
  BoardDecisionListItemSchema,
  BoardDecisionResSchema,
  BoardSessionListItemSchema,
  BoardSessionResSchema,
  CreateBoardDecisionBodySchema,
  CreateBoardSessionBodySchema,
  ListBoardDecisionsQuerySchema,
  ListBoardSessionsQuerySchema,
  UpdateBoardConfigBodySchema
} from './board-schema'

describe('CreateBoardSessionBodySchema endTime (Fix-2)', () => {
  const base = {
    title: 'Phien hop thang 7',
    startTime: new Date(Date.now() + 3_600_000).toISOString(),
    allowedEditorIds: ['012345678901234567890123', '012345678901234567890124', '012345678901234567890125']
  }

  it('accepts endTime after startTime', () => {
    const result = CreateBoardSessionBodySchema.safeParse({
      ...base,
      endTime: new Date(Date.now() + 7_200_000).toISOString()
    })
    expect(result.success).toBe(true)
  })

  it('rejects endTime <= startTime', () => {
    const result = CreateBoardSessionBodySchema.safeParse({
      ...base,
      endTime: new Date(Date.now() + 1_800_000).toISOString()
    })
    expect(result.success).toBe(false)
  })

  it('accepts missing endTime', () => {
    expect(CreateBoardSessionBodySchema.safeParse(base).success).toBe(true)
  })
})

describe('CreateBoardDecisionBodySchema details validation (Spec 16)', () => {
  const base = {
    boardSessionId: 'a'.repeat(24),
    decisionType: 'SERIALIZATION',
    targetSeriesId: 'b'.repeat(24)
  }
  const slot = { magazine: 'Weekly Mangaka Jump', startIssueNumber: 32, publicationType: 'WEEKLY' }

  it('accepts SERIALIZATION with a complete publication slot', () => {
    expect(CreateBoardDecisionBodySchema.safeParse({ ...base, details: slot }).success).toBe(true)
  })

  it('rejects SERIALIZATION with missing or invalid publication slot fields', () => {
    expect(CreateBoardDecisionBodySchema.safeParse(base).success).toBe(false)
    expect(CreateBoardDecisionBodySchema.safeParse({ ...base, details: {} }).success).toBe(false)
    expect(CreateBoardDecisionBodySchema.safeParse({ ...base, details: { ...slot, magazine: ' ' } }).success).toBe(
      false
    )
    expect(
      CreateBoardDecisionBodySchema.safeParse({ ...base, details: { ...slot, publicationType: 'DAILY' } }).success
    ).toBe(false)
    expect(
      CreateBoardDecisionBodySchema.safeParse({ ...base, details: { ...slot, startIssueNumber: 0 } }).success
    ).toBe(false)
  })

  it('allows optional CANCELLATION allowance and enforces integer range 1..10 when present', () => {
    const cancellation = { ...base, decisionType: 'CANCELLATION' }
    expect(CreateBoardDecisionBodySchema.safeParse({ ...cancellation, details: null }).success).toBe(true)
    expect(
      CreateBoardDecisionBodySchema.safeParse({ ...cancellation, details: { endingChapterAllowance: 3 } }).success
    ).toBe(true)
    expect(
      CreateBoardDecisionBodySchema.safeParse({ ...cancellation, details: { endingChapterAllowance: 0 } }).success
    ).toBe(false)
    expect(
      CreateBoardDecisionBodySchema.safeParse({ ...cancellation, details: { endingChapterAllowance: 11 } }).success
    ).toBe(false)
  })

  it('keeps details free-form for other current DecisionType values', () => {
    expect(CreateBoardDecisionBodySchema.safeParse({ ...base, decisionType: 'REPRINT', details: {} }).success).toBe(
      true
    )
  })

  // §v2 point 5: quyết định TRANSFER BẮT BUỘC gắn transferRequestId (chống tái dùng decision cho request khác).
  it('requires transferRequestId for TRANSFER decisions', () => {
    const transfer = { ...base, decisionType: 'TRANSFER', details: null }
    expect(CreateBoardDecisionBodySchema.safeParse(transfer).success).toBe(false)
    expect(CreateBoardDecisionBodySchema.safeParse({ ...transfer, transferRequestId: '  ' }).success).toBe(false)
    expect(CreateBoardDecisionBodySchema.safeParse({ ...transfer, transferRequestId: 'c'.repeat(24) }).success).toBe(
      true
    )
  })

  it.each(['PUBLICATION_CONTRACT', 'REPLACEMENT_CONTRACT'])(
    'accepts CONTRACT %s only with resourceId and versionId',
    (resourceType) => {
      const contractDecision = {
        ...base,
        decisionType: 'CONTRACT',
        details: {
          resourceType,
          resourceId: 'c'.repeat(24),
          versionId: 'd'.repeat(24)
        }
      }
      expect(CreateBoardDecisionBodySchema.safeParse(contractDecision).success).toBe(true)
      expect(
        CreateBoardDecisionBodySchema.safeParse({
          ...contractDecision,
          details: { resourceType, resourceId: 'c'.repeat(24) }
        }).success
      ).toBe(false)
    }
  )

  it.each(['CONTRACT_AMENDMENT', 'TRANSFER_CONTRACT'])('accepts CONTRACT %s without a versionId', (resourceType) => {
    expect(
      CreateBoardDecisionBodySchema.safeParse({
        ...base,
        decisionType: 'CONTRACT',
        details: { resourceType, resourceId: 'c'.repeat(24) }
      }).success
    ).toBe(true)
  })

  it('rejects CONTRACT decisions with missing series, unsupported resourceType or malformed resourceId', () => {
    const details = {
      resourceType: 'PUBLICATION_CONTRACT',
      resourceId: 'c'.repeat(24),
      versionId: 'd'.repeat(24)
    }
    expect(
      CreateBoardDecisionBodySchema.safeParse({
        boardSessionId: base.boardSessionId,
        decisionType: 'CONTRACT',
        details
      }).success
    ).toBe(false)
    expect(
      CreateBoardDecisionBodySchema.safeParse({
        ...base,
        decisionType: 'CONTRACT',
        details: { ...details, resourceType: 'UNKNOWN' }
      }).success
    ).toBe(false)
    expect(
      CreateBoardDecisionBodySchema.safeParse({
        ...base,
        decisionType: 'CONTRACT',
        details: { ...details, resourceId: 'bad' }
      }).success
    ).toBe(false)
  })

  // Regression §83.1: FORMAT_CHANGE thiếu details.publicationType từng được nhận 2xx rồi
  // SeriesLifecycleService.changeFormat chỉ logger.warn + return -> series ĐỨNG YÊN, không notify,
  // không sinh Amendment (silent no-op). Chặn ngay tại Zod để Board không bao giờ chốt được
  // một quyết định đổi format vô nghĩa.
  it('rejects FORMAT_CHANGE without a valid details.publicationType', () => {
    const formatChange = { ...base, decisionType: 'FORMAT_CHANGE' }
    expect(CreateBoardDecisionBodySchema.safeParse(formatChange).success).toBe(false)
    expect(CreateBoardDecisionBodySchema.safeParse({ ...formatChange, details: null }).success).toBe(false)
    expect(CreateBoardDecisionBodySchema.safeParse({ ...formatChange, details: {} }).success).toBe(false)
    expect(
      CreateBoardDecisionBodySchema.safeParse({ ...formatChange, details: { publicationType: 'DAILY' } }).success
    ).toBe(false)
  })

  it('reports the missing FORMAT_CHANGE publicationType on the details.publicationType path', () => {
    const parsed = CreateBoardDecisionBodySchema.safeParse({ ...base, decisionType: 'FORMAT_CHANGE', details: {} })
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(parsed.error.issues.map((i) => i.path.join('.'))).toContain('details.publicationType')
  })

  it('accepts FORMAT_CHANGE for each valid publicationType', () => {
    for (const publicationType of ['WEEKLY', 'MONTHLY', 'IRREGULAR']) {
      expect(
        CreateBoardDecisionBodySchema.safeParse({
          ...base,
          decisionType: 'FORMAT_CHANGE',
          details: { publicationType }
        }).success
      ).toBe(true)
    }
  })
})

describe('ListBoardSessionsQuerySchema mine parsing (Spec 16)', () => {
  it('parses true and false without truthy string coercion', () => {
    expect(ListBoardSessionsQuerySchema.parse({ mine: 'true' }).mine).toBe(true)
    expect(ListBoardSessionsQuerySchema.parse({ mine: 'false' }).mine).toBe(false)
  })

  it('rejects non-boolean query strings', () => {
    expect(ListBoardSessionsQuerySchema.safeParse({ mine: '1' }).success).toBe(false)
  })
})

describe('Board API contracts (Spec 17)', () => {
  it('accepts targetSeriesId alone or combined with boardSessionId', () => {
    expect(ListBoardDecisionsQuerySchema.parse({ targetSeriesId: 'a'.repeat(24) })).toEqual({
      targetSeriesId: 'a'.repeat(24)
    })
    expect(
      ListBoardDecisionsQuerySchema.parse({ boardSessionId: 'b'.repeat(24), targetSeriesId: 'a'.repeat(24) })
    ).toEqual({ boardSessionId: 'b'.repeat(24), targetSeriesId: 'a'.repeat(24) })
  })

  it('documents quorumMin as the default roster size instead of vote quorum', () => {
    expect(UpdateBoardConfigBodySchema.shape.quorumMin.description).toContain('roster')
    expect(BoardConfigResSchema.shape.quorumMin.description).toContain('roster')
  })
})

// Spec 25 — chống drift giữa list và detail.
describe('BoardDecisionListItemSchema (Spec 25)', () => {
  const listKeys = Object.keys(BoardDecisionListItemSchema.shape)
  const detailKeys = Object.keys(BoardDecisionResSchema.shape)

  it('bỏ votes/details/allowedEditorIds khỏi list', () => {
    for (const key of ['votes', 'details', 'allowedEditorIds']) expect(listKeys).not.toContain(key)
    expect(listKeys).toHaveLength(13)
  })

  // 🔴 Card danh sách quyết định phải hiện được "3/5 phiếu, đủ quorum". Các số đếm đã tính sẵn ở
  // cấp decision nên bỏ votes[] KHÔNG làm mất thông tin — nhưng bỏ nhầm 4 field này thì mất.
  it('giữ số đếm phiếu + quorum cho card', () => {
    for (const key of ['quorumMet', 'totalVotes', 'approveCount', 'rejectCount']) {
      expect(listKeys).toContain(key)
    }
  })

  it('là tập con thực sự của BoardDecisionResSchema', () => {
    for (const key of listKeys) expect(detailKeys).toContain(key)
  })
})

describe('BoardSessionListItemSchema (Spec 25)', () => {
  const listKeys = Object.keys(BoardSessionListItemSchema.shape)
  const detailKeys = Object.keys(BoardSessionResSchema.shape)

  it('bỏ members/allowedEditorIds/description khỏi list', () => {
    for (const key of ['members', 'allowedEditorIds', 'description']) expect(listKeys).not.toContain(key)
    expect(listKeys).toHaveLength(10)
  })

  it('là tập con thực sự của BoardSessionResSchema', () => {
    for (const key of listKeys) expect(detailKeys).toContain(key)
  })
})
