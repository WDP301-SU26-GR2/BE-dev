import { RoleName } from 'src/core/security/constants/role.constant'
import { TransferAccessDeniedException } from '../errors/transfer.error'
import { TransferAccessPolicy } from './transfer-access.policy'
import { TransferSigningService } from './transfer-signing.service'

/**
 * O-3 (review W4, 2026-08-05) — `finalizeBoardSignature` dùng non-null assertion
 * `contract.toMangakaId!` / `contract.fromMangakaId!` mà không có guard nào chặn trước.
 * Hợp đồng chuyển nhượng thiếu hai id đó sẽ ghi `undefined` vào `Series.mangakaId` khi Hội đồng ký.
 * ⇒ Phải chặn ngay ở đầu `sign()`, cùng chỗ với guard `transferRequestId`/`seriesId` sẵn có.
 */
describe('TransferSigningService.sign — guard dữ liệu hợp đồng (O-3)', () => {
  const CONTRACT_ID = '012345678901234567890124'

  function makeService(contractOverride: Record<string, unknown>) {
    const contract = {
      id: CONTRACT_ID,
      transferRequestId: '012345678901234567890125',
      seriesId: '012345678901234567890126',
      fromMangakaId: 'mangakaA',
      toMangakaId: 'mangakaB',
      transferType: 'FULL_TRANSFER',
      status: 'B_SIGNED',
      signatures: [],
      ...contractOverride
    }
    const repository = { findUserById: jest.fn().mockResolvedValue({ id: 'board1', email: 'b@x.io' }) }
    const resourceLoader = {
      loadContract: jest.fn().mockResolvedValue(contract),
      loadRequest: jest.fn().mockResolvedValue({ id: contract.transferRequestId, boardDecisionId: 'dec1' }),
      boardMemberIds: jest.fn().mockResolvedValue(['board1']),
      findApprovedContractDecision: jest.fn().mockResolvedValue({ id: 'dec1' })
    }
    const transactions = { require: jest.fn(() => ({ uow: { runInTransaction: jest.fn() } })) }
    const service = new TransferSigningService(
      repository as never,
      { record: jest.fn() } as never,
      new TransferAccessPolicy(),
      resourceLoader as never,
      transactions as never,
      { notifySafe: jest.fn() } as never
    )
    return { service, repository, transactions, resourceLoader }
  }

  const boardActor = { userId: 'board1', roleName: RoleName.BOARD_MEMBER }

  it('thiếu toMangakaId → 403 TransferAccessDenied, KHÔNG mở transaction', async () => {
    const { service, transactions } = makeService({ toMangakaId: null })

    await expect(service.sign(CONTRACT_ID, boardActor as never, { otpCode: '123456' })).rejects.toMatchObject(
      TransferAccessDeniedException
    )
    expect(transactions.require).not.toHaveBeenCalled()
  })

  it('thiếu fromMangakaId → 403 TransferAccessDenied, KHÔNG mở transaction', async () => {
    const { service, transactions } = makeService({ fromMangakaId: null })

    await expect(service.sign(CONTRACT_ID, boardActor as never, { otpCode: '123456' })).rejects.toMatchObject(
      TransferAccessDeniedException
    )
    expect(transactions.require).not.toHaveBeenCalled()
  })

  it('đủ dữ liệu → qua được guard (đi tiếp tới bước nạp người ký)', async () => {
    const { service, repository, transactions } = makeService({})

    await service.sign(CONTRACT_ID, boardActor, { otpCode: '123456' })

    expect(repository.findUserById).toHaveBeenCalledWith('board1')
    expect(transactions.require).toHaveBeenCalled()
  })
})
