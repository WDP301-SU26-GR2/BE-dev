import { ReprintRequestStatus } from '@prisma/client'
import { ReprintRequestStateService, REPRINT_REQUEST_TRANSITIONS } from './reprint-request-state.service'

// B-RPT-02: mangakaReview được gọi khi request đang PENDING/PROPOSED (không ai set MANGAKA_REVIEW
// trước đó) → bảng transition phải cho phép accept/reject trực tiếp từ 2 trạng thái này,
// nếu không mọi lượt Mangaka accept đều 409 ở runtime (test service mock stateService nên không lộ).
describe('REPRINT_REQUEST_TRANSITIONS (B-RPT-02 mangaka review reachability)', () => {
  const repository = { compareAndSetStatus: jest.fn() }
  const audit = { record: jest.fn().mockResolvedValue(undefined) }
  const service = new ReprintRequestStateService(repository as never, audit as never)

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

  it('owns the CAS write and audits only after a successful transition', async () => {
    const updated = { id: 'request-1', status: ReprintRequestStatus.MANGAKA_APPROVED }
    const approvedAt = new Date()
    repository.compareAndSetStatus.mockResolvedValueOnce(updated)

    await expect(
      service.transition(
        'request-1',
        ReprintRequestStatus.PENDING,
        ReprintRequestStatus.MANGAKA_APPROVED,
        'mangaka-1',
        'accepted',
        { mangakaApprovedAt: approvedAt }
      )
    ).resolves.toBe(updated)
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'mangaka-1', fromState: 'PENDING', toState: 'MANGAKA_APPROVED' })
    )

    repository.compareAndSetStatus.mockResolvedValueOnce(null)
    audit.record.mockClear()
    await expect(
      service.transition('request-1', ReprintRequestStatus.PENDING, ReprintRequestStatus.MANGAKA_APPROVED, 'mangaka-1')
    ).rejects.toMatchObject({ status: 409 })
    expect(audit.record).not.toHaveBeenCalled()
  })
})
