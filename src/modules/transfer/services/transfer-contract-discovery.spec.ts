// Spec 27 — Flow 8 contract discoverability.
// Trước spec này, `transferContractId` KHÔNG lộ ra ở bất kỳ đường GET nào:
//   - `POST /transfers/contracts` trả id nhưng chỉ EDITOR gọi được;
//   - `GET /transfers/contracts/:id/signatures` lại CẦN chính id đó (vòng lặp chết);
//   - `GET /transfers/requests/*` chỉ trả `originalContractId` (hợp đồng XUẤT BẢN, khác entity).
// ⇒ Mangaka A/B và Board không có cách nào lấy id để ký. Spec này thêm:
//   1. `transferContractId` vào mọi response TransferRequest (detail + 2 list);
//   2. `GET /transfers/contracts/:id` — đọc điều khoản trước khi ký (RBAC như `getSignatures`).
import { RoleName } from 'src/core/security/constants/role.constant'
import { TransferAccessDeniedException, TransferContractNotFoundException } from '../errors/transfer.error'
import { TransferAccessPolicy } from './transfer-access.policy'
import { TransferContractService } from './transfer-contract.service'
import { TransferNegotiationService } from './transfer-negotiation.service'
import { TransferRequestService } from './transfer-request.service'
import { TransferResourceLoader } from './transfer-resource-loader.service'
import { TransferContractQueryService } from './transfer-contract-query.service'
import { TransferSigningService } from './transfer-signing.service'
import { TransferTransactionService } from './transfer-transaction.service'
import { TransferService } from './transfer.service'

const REQUEST_ID = '507f1f77bcf86cd799439011'
const CONTRACT_ID = '507f1f77bcf86cd799439012'

const actor = (userId: string, roleName: (typeof RoleName)[keyof typeof RoleName]) => ({ userId, roleName })

const contractRow = {
  id: CONTRACT_ID,
  transferRequestId: REQUEST_ID,
  seriesId: 'series-1',
  fromMangakaId: 'mangaka-a',
  toMangakaId: 'mangaka-b',
  transferType: 'PARTIAL_TRANSFER',
  transferAmount: 5_000_000,
  newOwnershipSplit: { publisher: 70, 'mangaka-a': 10, 'mangaka-b': 20 },
  coOwnerApprovalRequired: true,
  status: 'A_SIGNED',
  createdAt: new Date('2026-07-29T00:00:00.000Z'),
  signatures: [
    {
      id: 'sig-1',
      transferContractId: CONTRACT_ID,
      userId: 'mangaka-a',
      role: 'MANGAKA_A',
      signedAt: new Date('2026-07-29T01:00:00.000Z')
    }
  ]
}

function setup() {
  const request = {
    id: REQUEST_ID,
    seriesId: 'series-1',
    requestingMangakaId: 'mangaka-b',
    originalMangakaId: 'mangaka-a',
    originalContractType: 'REVENUE_SHARE',
    originalContractId: 'publishing-contract-old',
    transferContractId: CONTRACT_ID,
    status: 'AWAITING_TRANSFER_SIGNATURES',
    boardDecisionId: 'decision-1'
  }
  const repo = {
    findTransferRequestById: jest.fn().mockResolvedValue(request),
    findTransferRequestsByMangaka: jest.fn().mockResolvedValue([request]),
    findPendingBoardRequests: jest.fn().mockResolvedValue([request]),
    findSeriesAccessScope: jest.fn().mockResolvedValue({ editorId: 'editor-1' }),
    findTransferContractById: jest.fn().mockResolvedValue(contractRow)
  }
  const board = {
    getTransferDecisionContext: jest.fn().mockResolvedValue({
      id: 'decision-1',
      boardSessionId: 'session-1',
      targetSeriesId: 'series-1',
      decisionType: 'TRANSFER',
      result: 'APPROVED',
      allowedEditorIds: ['board-1']
    }),
    findTerminalTransferDecisionContextsBySession: jest.fn()
  }
  const audit = { record: jest.fn().mockResolvedValue(undefined) }
  const policy = new TransferAccessPolicy()
  const loader = new TransferResourceLoader(repo as never, board as never, policy)
  const transactions = new TransferTransactionService(undefined, undefined, undefined, undefined, undefined, undefined)
  const service = new TransferService(
    new TransferRequestService(repo as never, audit as never, policy, loader, transactions),
    new TransferNegotiationService(repo as never, audit as never, policy, loader, transactions),
    new TransferContractService(repo as never, audit as never, policy, loader, transactions, {
      notifySafe: jest.fn()
    } as never),
    new TransferSigningService(repo as never, audit as never, policy, loader, transactions, {
      notifySafe: jest.fn()
    } as never),
    new TransferContractQueryService(repo as never, policy, loader)
  )
  return { service, repo, request }
}

describe('Spec 27 — GET /transfers/contracts/:id (đọc điều khoản trước khi ký)', () => {
  it('trả đủ điều khoản để bên ký quyết định (số tiền, tỷ lệ sở hữu mới, trạng thái ký)', async () => {
    const { service } = setup()

    await expect(service.getTransferContractById(CONTRACT_ID, actor('mangaka-a', RoleName.MANGAKA))).resolves.toEqual(
      expect.objectContaining({
        id: CONTRACT_ID,
        transferRequestId: REQUEST_ID,
        transferType: 'PARTIAL_TRANSFER',
        transferAmount: 5_000_000,
        newOwnershipSplit: { publisher: 70, 'mangaka-a': 10, 'mangaka-b': 20 },
        coOwnerApprovalRequired: true,
        status: 'A_SIGNED'
      })
    )
  })

  it.each([
    ['Mangaka A (bên nhượng)', 'mangaka-a', RoleName.MANGAKA],
    ['Mangaka B (bên nhận)', 'mangaka-b', RoleName.MANGAKA],
    ['Board member trong roster quyết định', 'board-1', RoleName.BOARD_MEMBER],
    ['Editor phụ trách series', 'editor-1', RoleName.EDITOR],
    ['Super Admin', 'admin', RoleName.SUPER_ADMIN]
  ])('cho phép %s đọc hợp đồng', async (_label, userId, roleName) => {
    const { service } = setup()
    await expect(service.getTransferContractById(CONTRACT_ID, actor(userId, roleName))).resolves.toMatchObject({
      id: CONTRACT_ID
    })
  })

  it.each([
    ['Mangaka ngoài cuộc', 'mangaka-c', RoleName.MANGAKA],
    ['Editor không phụ trách series', 'editor-other', RoleName.EDITOR],
    ['Board member ngoài roster', 'board-other', RoleName.BOARD_MEMBER]
  ])('chặn %s (403)', async (_label, userId, roleName) => {
    const { service } = setup()
    await expect(service.getTransferContractById(CONTRACT_ID, actor(userId, roleName))).rejects.toBe(
      TransferAccessDeniedException
    )
  })

  it('id rác không phải ObjectId → 404 sạch, KHÔNG để Prisma ném P2023 → 500', async () => {
    const { service, repo } = setup()
    await expect(service.getTransferContractById('not-an-objectid', actor('admin', RoleName.SUPER_ADMIN))).rejects.toBe(
      TransferContractNotFoundException
    )
    expect(repo.findTransferContractById).not.toHaveBeenCalled()
  })

  it('hợp đồng không tồn tại → 404', async () => {
    const { service, repo } = setup()
    repo.findTransferContractById.mockResolvedValue(null)
    await expect(service.getTransferContractById(CONTRACT_ID, actor('admin', RoleName.SUPER_ADMIN))).rejects.toBe(
      TransferContractNotFoundException
    )
  })

  it('hợp đồng mồ côi (mất transferRequestId/seriesId) → 403, không lộ dữ liệu', async () => {
    const { service, repo } = setup()
    repo.findTransferContractById.mockResolvedValue({ ...contractRow, transferRequestId: null })
    await expect(service.getTransferContractById(CONTRACT_ID, actor('admin', RoleName.SUPER_ADMIN))).rejects.toBe(
      TransferAccessDeniedException
    )
  })
})

describe('Spec 27 — transferContractId lộ ra ở mọi đường GET TransferRequest', () => {
  it('detail: GET /transfers/requests/:id mang transferContractId để bên ký lấy được id', async () => {
    const { service } = setup()
    await expect(
      service.getTransferRequestById(REQUEST_ID, actor('mangaka-a', RoleName.MANGAKA))
    ).resolves.toMatchObject({ transferContractId: CONTRACT_ID })
  })

  it('list Mangaka: GET /transfers/requests/mine mang transferContractId', async () => {
    const { service } = setup()
    const result = await service.getTransferRequestsByMangaka('mangaka-a')
    expect(result.data[0]).toMatchObject({ transferContractId: CONTRACT_ID })
  })

  it('list Board: GET /transfers/requests/pending-board mang transferContractId', async () => {
    const { service } = setup()
    const result = await service.getPendingBoardRequests()
    expect(result.data[0]).toMatchObject({ transferContractId: CONTRACT_ID })
  })

  it('chưa soạn hợp đồng → transferContractId null (không phải undefined/thiếu field)', async () => {
    const { service, repo } = setup()
    repo.findTransferRequestById.mockResolvedValue({
      ...setup().request,
      status: 'UNDER_REVIEW',
      transferContractId: null
    })
    await expect(
      service.getTransferRequestById(REQUEST_ID, actor('mangaka-a', RoleName.MANGAKA))
    ).resolves.toMatchObject({ transferContractId: null })
  })
})
