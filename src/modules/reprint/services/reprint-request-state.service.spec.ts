import { ReprintRequestStatus } from '@prisma/client'
import { ReprintRequestStateService, REPRINT_REQUEST_TRANSITIONS } from './reprint-request-state.service'

// B-RPT-02: mangakaReview được gọi khi request đang PENDING/PROPOSED (không ai set MANGAKA_REVIEW
// trước đó) → bảng transition phải cho phép accept/reject trực tiếp từ 2 trạng thái này,
// nếu không mọi lượt Mangaka accept đều 409 ở runtime (test service mock stateService nên không lộ).
describe('REPRINT_REQUEST_TRANSITIONS (B-RPT-02 mangaka review reachability)', () => {
  const service = new ReprintRequestStateService({ record: jest.fn().mockResolvedValue(undefined) } as never)

  it.each([
    [ReprintRequestStatus.PENDING, ReprintRequestStatus.MANGAKA_APPROVED],
    [ReprintRequestStatus.PROPOSED, ReprintRequestStatus.MANGAKA_APPROVED],
    [ReprintRequestStatus.PENDING, ReprintRequestStatus.REJECTED_BY_MANGAKA],
    [ReprintRequestStatus.PROPOSED, ReprintRequestStatus.REJECTED_BY_MANGAKA]
  ])('allows %s → %s (mangaka accept/reject reachable)', (from, to) => {
    expect(() => service.assertTransition(from, to)).not.toThrow()
  })

  it.each([
    [ReprintRequestStatus.PENDING, ReprintRequestStatus.PUBLISHED],
    [ReprintRequestStatus.PUBLISHED, ReprintRequestStatus.BOARD_APPROVED],
    [ReprintRequestStatus.REJECTED, ReprintRequestStatus.BOARD_APPROVED]
  ])('still rejects %s → %s', (from, to) => {
    expect(() => service.assertTransition(from, to)).toThrow()
  })

  it('every enum value has a row in the table (exhaustive)', () => {
    for (const status of Object.values(ReprintRequestStatus)) {
      expect(REPRINT_REQUEST_TRANSITIONS[status]).toBeDefined()
    }
  })
})
