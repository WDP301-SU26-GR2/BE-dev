import { ContractStatus } from '@prisma/client'
import { ContractWorkflowService } from './contract-workflow.service'

// Spec 2026-08-06 — Group F: POST /contracts/:id/void
describe('ContractWorkflowService.void', () => {
  const CID = 'a'.repeat(24)
  const EDITOR = 'e1'

  const setup = (contract: unknown) => {
    const repository = {
      findById: jest.fn().mockResolvedValue(contract),
      updateStatus: jest.fn().mockResolvedValue({ id: CID, status: ContractStatus.VOIDED }),
      findRosterForContract: jest.fn().mockResolvedValue(['b1', 'b2'])
    }
    const notificationService = { notifySafe: jest.fn().mockResolvedValue(undefined) }
    const auditService = { record: jest.fn().mockResolvedValue(undefined) }
    const service = new ContractWorkflowService(
      repository as never,
      notificationService as never,
      auditService as never,
      {} as never
    )
    return { service, repository, notificationService, auditService }
  }

  it('huỷ HĐ DRAFT → VOIDED + audit, KHÔNG notify tác giả', async () => {
    const f = setup({ id: CID, status: ContractStatus.DRAFT, editorId: EDITOR, mangakaId: 'm1' })
    const res = await f.service.void(CID, EDITOR, { reason: 'Soạn nhầm' })
    expect(res).toMatchObject({ status: ContractStatus.VOIDED })
    expect(f.repository.updateStatus).toHaveBeenCalledTimes(1) // KHÔNG ghi 2 lần
    expect(f.auditService.record).toHaveBeenCalledTimes(1)
    expect(f.notificationService.notifySafe).not.toHaveBeenCalled() // DRAFT: tác giả chưa biết HĐ
  })

  it('huỷ HĐ BOARD_REVIEW → notify tác giả + roster Hội đồng', async () => {
    const f = setup({ id: CID, status: ContractStatus.BOARD_REVIEW, editorId: EDITOR, mangakaId: 'm1' })
    await f.service.void(CID, EDITOR, { reason: 'Đổi điều khoản' })
    const recipients = f.notificationService.notifySafe.mock.calls.map(
      (c) => (c[0] as { recipientId: string }).recipientId
    )
    expect(recipients).toEqual(expect.arrayContaining(['m1', 'b1', 'b2']))
  })

  it('không phải editor phụ trách → 403', async () => {
    const f = setup({ id: CID, status: ContractStatus.DRAFT, editorId: 'other', mangakaId: 'm1' })
    await expect(f.service.void(CID, EDITOR, { reason: 'x' })).rejects.toMatchObject({ status: 403 })
    expect(f.repository.updateStatus).not.toHaveBeenCalled()
  })

  it('HĐ đã AWAITING_MANGAKA (đại diện đã ký) → 409, không huỷ đơn phương', async () => {
    const f = setup({ id: CID, status: ContractStatus.AWAITING_MANGAKA, editorId: EDITOR, mangakaId: 'm1' })
    await expect(f.service.void(CID, EDITOR, { reason: 'x' })).rejects.toMatchObject({ status: 409 })
    expect(f.repository.updateStatus).not.toHaveBeenCalled()
  })

  it('id rác → 404', async () => {
    const f = setup(null)
    await expect(f.service.void('bad', EDITOR, { reason: 'x' })).rejects.toMatchObject({ status: 404 })
  })
})
