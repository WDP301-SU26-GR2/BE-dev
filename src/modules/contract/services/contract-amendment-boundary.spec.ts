import 'reflect-metadata'
import { ContractAmendmentService } from './contract-amendment.service'

describe('ContractAmendmentService boundary', () => {
  it('is a three-use-case compatibility facade', () => {
    expect(Reflect.getMetadata('design:paramtypes', ContractAmendmentService) as unknown[]).toHaveLength(3)
  })
})
