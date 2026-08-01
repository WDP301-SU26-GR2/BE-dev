import { ContractController } from './contract.controller'
import { ContractAmendmentController } from './contract-amendment.controller'
import { PaymentConditionController } from './payment-condition.controller'

const resolved = { id: 'result' }

function serviceMock(methods: string[]) {
  return Object.fromEntries(methods.map((method) => [method, jest.fn().mockResolvedValue(resolved)]))
}

describe('ContractController delegation', () => {
  const contract = serviceMock([
    'healthCheck',
    'getContracts',
    'exportPdf',
    'getContractById',
    'getContractVersions',
    'getContractVersionById',
    'createDraft',
    'editorUpdateContract',
    'submitForReview',
    'claimRepresentative',
    'releaseRepresentative',
    'assignRepresentative',
    'addComment',
    'listComments',
    'signByRepresentativeWithOtp',
    'signByMangakaWithOtp',
    'rejectByMangaka',
    'redraft',
    'reportRevenue',
    'checkContractStatus'
  ])
  const payment = serviceMock([
    'createPaymentCondition',
    'getPaymentConditionsByContract',
    'updatePaymentCondition',
    'disablePaymentCondition'
  ])
  const amendment = serviceMock([
    'create',
    'list',
    'detail',
    'update',
    'submit',
    'signMangaka',
    'signBoard',
    'reject',
    'void'
  ])
  const controller = new ContractController(contract as never)
  const paymentController = new PaymentConditionController(payment as never)
  const amendmentController = new ContractAmendmentController(amendment as never)

  beforeEach(() => jest.clearAllMocks())

  it('delegates health, scoped queries, versions and PDF export with the active viewer', async () => {
    controller.health()
    await controller.getContracts('u1', 'EDITOR')
    await controller.exportPdf('c1', 'u1', 'EDITOR')
    await controller.getContractById('c1', 'u1', 'EDITOR')
    await controller.getContractVersions('c1', 'u1', 'EDITOR')
    await controller.getContractVersionById('c1', 'v1', 'u1', 'EDITOR')

    expect(contract.healthCheck).toHaveBeenCalledWith()
    expect(contract.getContracts).toHaveBeenCalledWith('u1', 'EDITOR')
    expect(contract.exportPdf).toHaveBeenCalledWith('c1', 'u1', 'EDITOR')
    expect(contract.getContractById).toHaveBeenCalledWith('c1', 'u1', 'EDITOR')
    expect(contract.getContractVersions).toHaveBeenCalledWith('c1', 'u1', 'EDITOR')
    expect(contract.getContractVersionById).toHaveBeenCalledWith('c1', 'v1', 'u1', 'EDITOR')
  })

  it('delegates draft editing and two-phase contract commands', async () => {
    const draft = { seriesId: 's1' }
    await controller.createDraft('editor', draft as never)
    await controller.updateContract('c1', 'editor', { valuationAmount: 10, note: 'revision' })
    await controller.submitReview('c1', 'editor')
    await controller.claim('c1', 'board')
    await controller.release('c1', 'board')
    await controller.assignRepresentative('c1', 'admin', { representativeId: 'board' })
    await controller.addComment('c1', 'board', { content: 'LGTM' })
    await controller.listComments('c1', 'editor', 'EDITOR')
    await controller.signRepresentative('c1', 'b1', 'b@example.com', { otpCode: '654321' })
    await controller.signMangaka('c1', 'm1', 'm@example.com', { otpCode: '123456' })
    await controller.reject('c1', 'm1', { reason: 'revise price' })
    await controller.redraft('c1', 'editor')

    expect(contract.createDraft).toHaveBeenCalledWith('editor', draft)
    expect(contract.editorUpdateContract).toHaveBeenCalledWith('c1', 'editor', { valuationAmount: 10 }, 'revision')
    expect(contract.submitForReview).toHaveBeenCalledWith('c1', 'editor')
    expect(contract.claimRepresentative).toHaveBeenCalledWith('c1', 'board')
    expect(contract.releaseRepresentative).toHaveBeenCalledWith('c1', 'board')
    expect(contract.assignRepresentative).toHaveBeenCalledWith('c1', 'admin', { representativeId: 'board' })
    expect(contract.addComment).toHaveBeenCalledWith('c1', 'board', { content: 'LGTM' })
    expect(contract.listComments).toHaveBeenCalledWith('c1', 'editor', 'EDITOR')
    expect(contract.signByRepresentativeWithOtp).toHaveBeenCalledWith('c1', 'b1', 'b@example.com', '654321')
    expect(contract.signByMangakaWithOtp).toHaveBeenCalledWith('c1', 'm1', 'm@example.com', '123456')
    expect(contract.rejectByMangaka).toHaveBeenCalledWith('c1', 'm1', { reason: 'revise price' })
    expect(contract.redraft).toHaveBeenCalledWith('c1', 'editor')
  })

  it('delegates revenue reporting and signing progress', async () => {
    await controller.reportRevenue('c1', 'e1', 'EDITOR', { revenue: 100, period: '2026-Q1' })
    await controller.checkStatus('c1', 'm1', 'MANGAKA')

    expect(contract.reportRevenue).toHaveBeenCalledWith('c1', 'e1', 'EDITOR', {
      revenue: 100,
      period: '2026-Q1'
    })
    expect(contract.checkContractStatus).toHaveBeenCalledWith('c1', 'm1', 'MANGAKA')
  })

  it('delegates payment-condition commands to the payment capability', async () => {
    await paymentController.createPaymentCondition('c1', 'e1', { conditionType: 'CHAPTER_MILESTONE' } as never)
    await paymentController.getPaymentConditions('c1', 'u1', 'EDITOR')
    await paymentController.updatePaymentCondition('c1', 'p1', 'e1', { payoutAmount: 100 })
    await paymentController.disablePaymentCondition('c1', 'p1', 'e1')

    expect(payment.createPaymentCondition).toHaveBeenCalledWith('c1', 'e1', { conditionType: 'CHAPTER_MILESTONE' })
    expect(payment.getPaymentConditionsByContract).toHaveBeenCalledWith('c1', 'u1', 'EDITOR')
    expect(payment.updatePaymentCondition).toHaveBeenCalledWith('c1', 'p1', 'e1', { payoutAmount: 100 })
    expect(payment.disablePaymentCondition).toHaveBeenCalledWith('c1', 'p1', 'e1')
  })

  it('delegates the complete amendment lifecycle with actor and OTP context', async () => {
    await amendmentController.createAmendment('c1', 'e1', { changedClauses: ['ownership'] })
    await amendmentController.listAmendments('c1', 'u1', 'EDITOR')
    await amendmentController.getAmendment('c1', 'a1', 'u1', 'EDITOR')
    await amendmentController.updateAmendment('c1', 'a1', 'e1', { reason: 'updated' })
    await amendmentController.submitAmendment('c1', 'a1', 'e1')
    await amendmentController.signAmendmentMangaka('c1', 'a1', 'm1', 'm@example.com', { otpCode: '123456' })
    await amendmentController.signAmendmentBoard('c1', 'a1', 'b1', 'b@example.com', { otpCode: '654321' })
    await amendmentController.rejectAmendment('c1', 'a1', 'm1', { reason: 'reject' })
    await amendmentController.voidAmendment('c1', 'a1', 'e1', { voidReason: 'superseded' })

    expect(amendment.create).toHaveBeenCalledWith('c1', 'e1', { changedClauses: ['ownership'] })
    expect(amendment.list).toHaveBeenCalledWith('c1', 'u1', 'EDITOR')
    expect(amendment.detail).toHaveBeenCalledWith('c1', 'a1', 'u1', 'EDITOR')
    expect(amendment.update).toHaveBeenCalledWith('c1', 'a1', 'e1', { reason: 'updated' })
    expect(amendment.submit).toHaveBeenCalledWith('c1', 'a1', 'e1')
    expect(amendment.signMangaka).toHaveBeenCalledWith('c1', 'a1', 'm1', 'm@example.com', '123456')
    expect(amendment.signBoard).toHaveBeenCalledWith('c1', 'a1', 'b1', 'b@example.com', '654321')
    expect(amendment.reject).toHaveBeenCalledWith('c1', 'a1', 'm1', 'reject')
    expect(amendment.void).toHaveBeenCalledWith('c1', 'a1', 'e1', 'superseded')
  })
})
