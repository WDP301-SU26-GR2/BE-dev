import { ContractAmendmentSigningService } from './contract-amendment-signing.service'

describe('ContractAmendmentSigningService Board approval gate', () => {
  function setup(decision: object | null) {
    const amendmentRepo = {
      findById: jest.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439012',
        contractId: '507f1f77bcf86cd799439011',
        status: 'PENDING_SIGNATURES'
      }),
      countBoardSignatures: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({}),
      findSignature: jest.fn().mockResolvedValue(null),
      addBoardSignature: jest.fn().mockResolvedValue({})
    }
    const contractRepo = {
      findById: jest.fn().mockResolvedValue({
        id: '507f1f77bcf86cd799439011',
        seriesId: '507f1f77bcf86cd799439013',
        mangakaId: 'mangaka-1',
        contractType: 'REVENUE_SHARE'
      })
    }
    const boardService = {
      findApprovedContractDecisionContext: jest.fn().mockResolvedValue(decision)
    }
    const service = new ContractAmendmentSigningService(
      amendmentRepo as never,
      contractRepo as never,
      { validateOtpCode: jest.fn().mockResolvedValue(undefined) } as never,
      { notifySafe: jest.fn() } as never,
      { record: jest.fn() } as never,
      boardService as never
    )
    return { service, amendmentRepo, boardService }
  }

  it('blocks the first signature when no approved CONTRACT_AMENDMENT decision exists', async () => {
    const { service, amendmentRepo } = setup(null)
    await expect(
      service.signMangaka(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439012',
        'mangaka-1',
        'm@example.com',
        '123456'
      )
    ).rejects.toMatchObject({ status: 409 })
    expect(amendmentRepo.update).not.toHaveBeenCalled()
  })

  it('uses the approval decision roster for Board authorization', async () => {
    const { service, amendmentRepo, boardService } = setup({
      id: 'decision-1',
      allowedEditorIds: ['board-1']
    })
    await service.signBoard(
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439012',
      'board-1',
      'b@example.com',
      '123456'
    )
    expect(boardService.findApprovedContractDecisionContext).toHaveBeenCalledWith({
      targetSeriesId: '507f1f77bcf86cd799439013',
      resourceType: 'CONTRACT_AMENDMENT',
      resourceId: '507f1f77bcf86cd799439012'
    })
    expect(amendmentRepo.addBoardSignature).toHaveBeenCalledWith('507f1f77bcf86cd799439012', 'board-1')
  })
})
