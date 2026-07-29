import 'reflect-metadata'
import { RoleName } from 'src/core/security/constants/role.constant'
import { ROLES_KEY } from 'src/core/security/decorators/roles.decorator'
import { TransferController } from './transfer.controller'

describe('TransferController ActorContext propagation', () => {
  const service = {
    getTransferRequestById: jest.fn(),
    boardApproveScreening: jest.fn(),
    startNegotiation: jest.fn(),
    createTransferContract: jest.fn(),
    signTransferContract: jest.fn(),
    getSignatures: jest.fn(),
    getTransferContractById: jest.fn()
  }
  const controller = new TransferController(service as never)

  beforeEach(() => jest.clearAllMocks())

  it('passes userId and roleName to request detail', async () => {
    await controller.getTransferRequestById('request-id', 'actor-id', RoleName.MANGAKA)
    expect(service.getTransferRequestById).toHaveBeenCalledWith('request-id', {
      userId: 'actor-id',
      roleName: RoleName.MANGAKA
    })
  })

  it('passes ActorContext and authoritative decision body to board approve', async () => {
    const body = { boardDecisionId: 'decision-id' }
    await controller.boardApproveScreening('request-id', body, 'board-id', RoleName.BOARD_MEMBER)
    expect(service.boardApproveScreening).toHaveBeenCalledWith(
      'request-id',
      { userId: 'board-id', roleName: RoleName.BOARD_MEMBER },
      body
    )
  })

  // Spec 27 — route đọc hợp đồng chuyển nhượng phải mở cho CẢ 4 role có thể xem
  // (2 Mangaka ký + Editor phụ trách + Board + Admin), nếu không bên ký vẫn mù điều khoản.
  it('truyền ActorContext sang route đọc chi tiết hợp đồng chuyển nhượng', async () => {
    await controller.getTransferContractById('contract-id', 'mangaka-a', RoleName.MANGAKA)
    expect(service.getTransferContractById).toHaveBeenCalledWith('contract-id', {
      userId: 'mangaka-a',
      roleName: RoleName.MANGAKA
    })
  })

  it('khai đủ 4 role cho GET /transfers/contracts/:id (drift-guard RBAC)', () => {
    // Đọc qua descriptor.value để tránh unbound-method reference (pattern như board.controller.roles.spec.ts).
    const handler = Object.getOwnPropertyDescriptor(TransferController.prototype, 'getTransferContractById')
      ?.value as object
    const roles = Reflect.getMetadata(ROLES_KEY, handler) as string[]
    expect(roles).toEqual([RoleName.MANGAKA, RoleName.EDITOR, RoleName.BOARD_MEMBER, RoleName.SUPER_ADMIN])
  })

  it('does not forward legacy signerRole query as authority input', async () => {
    const body = { otpCode: '123456' }
    await controller.signTransferContract('contract-id', body, 'mangaka-b', RoleName.MANGAKA)
    expect(service.signTransferContract).toHaveBeenCalledWith(
      'contract-id',
      { userId: 'mangaka-b', roleName: RoleName.MANGAKA },
      body
    )
  })
})
