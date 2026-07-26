import 'reflect-metadata'
import { PaymentEngineService } from './payment-engine.service'
import { PaymentService } from './payment.service'

describe('Payment application boundaries', () => {
  it('keeps REST compatibility facade focused on query, state and condition services', () => {
    expect(Reflect.getMetadata('design:paramtypes', PaymentService) as unknown[]).toHaveLength(3)
  })

  it('keeps event engine as a thin compatibility facade over focused trigger services', () => {
    expect(Reflect.getMetadata('design:paramtypes', PaymentEngineService) as unknown[]).toHaveLength(3)
  })
})
