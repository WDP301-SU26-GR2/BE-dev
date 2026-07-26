import {
  CreateContractBodySchema,
  EditorUpdateContractBodySchema,
  ReportRevenueBodySchema,
  SignContractWithOtpBodySchema
} from './contract-schema'
import {
  CreateAmendmentBodySchema,
  RejectAmendmentBodySchema,
  SignAmendmentBodySchema,
  UpdateAmendmentBodySchema,
  VoidAmendmentBodySchema
} from './contract-amendment-schema'

const baseContract = {
  seriesId: 'series',
  mangakaId: 'mangaka',
  boardDecisionId: 'decision',
  contractType: 'REVENUE_SHARE',
  valuationAmount: 1_000,
  publisherOwnershipPct: 60,
  mangakaOwnershipPct: 40,
  terminationClause: 'Material breach',
  contractStart: '2026-01-01T00:00:00.000Z',
  contractEnd: '2027-01-01T00:00:00.000Z'
}

describe('contract input business rules', () => {
  it('accepts a valid revenue-share contract and transforms its dates', () => {
    const parsed = CreateContractBodySchema.parse(baseContract)

    expect(parsed.contractStart).toEqual(new Date(baseContract.contractStart))
    expect(parsed.contractEnd).toEqual(new Date(baseContract.contractEnd))
  })

  it('requires a 100 percent ownership split except for a full buyout', () => {
    expect(
      CreateContractBodySchema.safeParse({ ...baseContract, publisherOwnershipPct: 80, mangakaOwnershipPct: 30 })
        .success
    ).toBe(false)
    expect(
      CreateContractBodySchema.safeParse({
        ...baseContract,
        contractType: 'FULL_BUYOUT',
        publisherOwnershipPct: 80,
        mangakaOwnershipPct: 30
      }).success
    ).toBe(true)
  })

  it('requires ownership percentages to be changed as one consistent pair', () => {
    expect(EditorUpdateContractBodySchema.safeParse({ publisherOwnershipPct: 60 }).success).toBe(false)
    expect(EditorUpdateContractBodySchema.safeParse({ mangakaOwnershipPct: 40 }).success).toBe(false)
    expect(
      EditorUpdateContractBodySchema.safeParse({ publisherOwnershipPct: 70, mangakaOwnershipPct: 40 }).success
    ).toBe(false)
    expect(
      EditorUpdateContractBodySchema.safeParse({ publisherOwnershipPct: 60, mangakaOwnershipPct: 40 }).success
    ).toBe(true)
    expect(
      EditorUpdateContractBodySchema.safeParse({
        contractType: 'FULL_BUYOUT',
        publisherOwnershipPct: 70
      }).success
    ).toBe(true)
  })

  it('validates OTP and positive revenue boundary inputs', () => {
    expect(SignContractWithOtpBodySchema.safeParse({ otpCode: '123456' }).success).toBe(true)
    expect(SignContractWithOtpBodySchema.safeParse({ otpCode: '12345' }).success).toBe(false)
    expect(ReportRevenueBodySchema.safeParse({ revenue: 1, period: '2026-Q1' }).success).toBe(true)
    expect(ReportRevenueBodySchema.safeParse({ revenue: 0, period: '' }).success).toBe(false)
  })
})

describe('contract amendment input business rules', () => {
  it('accepts a complete ownership change and ordered contract dates', () => {
    expect(
      CreateAmendmentBodySchema.safeParse({
        changedClauses: ['Ownership'],
        publisherOwnershipPct: 55,
        mangakaOwnershipPct: 45,
        contractStart: '2026-01-01T00:00:00.000Z',
        contractEnd: '2027-01-01T00:00:00.000Z'
      }).success
    ).toBe(true)
  })

  it('rejects incomplete or inconsistent ownership changes', () => {
    expect(
      CreateAmendmentBodySchema.safeParse({ changedClauses: ['Ownership'], publisherOwnershipPct: 55 }).success
    ).toBe(false)
    expect(
      CreateAmendmentBodySchema.safeParse({
        changedClauses: ['Ownership'],
        publisherOwnershipPct: 55,
        mangakaOwnershipPct: 40
      }).success
    ).toBe(false)
  })

  it('rejects a contract end that is not after its start', () => {
    expect(
      UpdateAmendmentBodySchema.safeParse({
        contractStart: '2027-01-01T00:00:00.000Z',
        contractEnd: '2026-01-01T00:00:00.000Z'
      }).success
    ).toBe(false)
  })

  it('enforces amendment action payloads and strict objects', () => {
    expect(RejectAmendmentBodySchema.safeParse({ reason: 'Terms rejected' }).success).toBe(true)
    expect(RejectAmendmentBodySchema.safeParse({ reason: '' }).success).toBe(false)
    expect(VoidAmendmentBodySchema.safeParse({ voidReason: 'Superseded' }).success).toBe(true)
    expect(VoidAmendmentBodySchema.safeParse({ voidReason: '', extra: true }).success).toBe(false)
    expect(SignAmendmentBodySchema.safeParse({ otpCode: '654321' }).success).toBe(true)
    expect(SignAmendmentBodySchema.safeParse({ otpCode: '65432' }).success).toBe(false)
  })
})
