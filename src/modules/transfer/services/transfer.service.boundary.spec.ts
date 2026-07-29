import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('TransferService architecture boundary', () => {
  it('is a thin facade over focused request, negotiation, contract and signing services', () => {
    const source = readFileSync(join(__dirname, 'transfer.service.ts'), 'utf8')
    const productionLines = source.split(/\r?\n/).filter((line) => line.trim().length > 0)
    const dependencies = source.match(/private readonly /g) ?? []

    expect(productionLines.length).toBeLessThanOrEqual(200)
    expect(dependencies.length).toBeLessThanOrEqual(6)
    expect(source).toContain('TransferRequestService')
    expect(source).toContain('TransferNegotiationService')
    expect(source).toContain('TransferContractService')
    expect(source).toContain('TransferContractQueryService')
    expect(source).toContain('TransferSigningService')
    expect(source).not.toContain('runInTransaction')
    expect(source).not.toContain('transferRepo.')
  })

  it.each([
    'transfer-request.service.ts',
    'transfer-negotiation.service.ts',
    'transfer-contract.service.ts',
    'transfer-contract-query.service.ts',
    'transfer-signing.service.ts',
    'transfer-resource-loader.service.ts',
    'transfer-transaction.service.ts'
  ])('%s remains within service size and dependency limits', (fileName) => {
    const source = readFileSync(join(__dirname, fileName), 'utf8')
    const productionLines = source.split(/\r?\n/).filter((line) => line.trim().length > 0)
    const dependencies = source.match(/private readonly /g) ?? []

    expect(productionLines.length).toBeLessThanOrEqual(200)
    expect(dependencies.length).toBeLessThanOrEqual(6)
  })

  it.each(['transfer-request.service.ts', 'transfer-negotiation.service.ts'])(
    '%s delegates request status writes to the single-writer state service',
    (fileName) => {
      const source = readFileSync(join(__dirname, fileName), 'utf8')

      expect(source).toContain('requestState.transition')
      expect(source).not.toContain('updateTransferRequest')
      expect(source).not.toContain('compareAndSetRequestStatus')
    }
  )

  it('keeps cross-domain workflow and direct status writers out of TransferRepo', () => {
    const source = readFileSync(join(__dirname, '..', 'transfer.repo.ts'), 'utf8')

    for (const method of [
      'updateTransferRequest',
      'terminateOldContract',
      'createNewContractFromTransfer',
      'updateSeriesOwnership',
      'updateTransferContractStatus',
      'addTransferContractSignature',
      'createTransferContract(data'
    ]) {
      expect(source).not.toContain(method)
    }
  })
})
