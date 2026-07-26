import { RoleName } from 'src/core/security/constants/role.constant'
import { TransferController } from './transfer.controller'

describe('TransferController ActorContext propagation', () => {
  const service = {
    getTransferRequestById: jest.fn(),
    boardApproveScreening: jest.fn(),
    startNegotiation: jest.fn(),
    createTransferContract: jest.fn(),
    signTransferContract: jest.fn(),
    getSignatures: jest.fn()
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
