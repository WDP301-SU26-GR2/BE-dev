import { PaymentController } from './payment.controller'

describe('PaymentController actor and authorization context forwarding', () => {
  const make = () => {
    const service = {
      getPayments: jest.fn(),
      getPaymentById: jest.fn(),
      approvePayment: jest.fn(),
      payPayment: jest.fn(),
      cancelPayment: jest.fn(),
      getPaymentsByContract: jest.fn(),
      getPaymentsBySeries: jest.fn(),
      getPaymentsByUserId: jest.fn()
    }
    return { controller: new PaymentController(service as never), service }
  }

  it('forwards filters for the privileged payment list', async () => {
    const { controller, service } = make()
    const query = { status: 'APPROVED' } as never

    await controller.getPayments(query)

    expect(service.getPayments).toHaveBeenCalledWith(query)
  })

  it('forwards authenticated user and role for object-level reads', async () => {
    const { controller, service } = make()

    await controller.getPaymentById('payment-1', 'user-1', 'MANGAKA')

    expect(service.getPaymentById).toHaveBeenCalledWith('payment-1', 'user-1', 'MANGAKA')
  })

  it('uses the authenticated actor for approve instead of accepting an actor in the body', async () => {
    const { controller, service } = make()

    await controller.approvePayment('payment-1', 'board-1')

    expect(service.approvePayment).toHaveBeenCalledWith('payment-1', 'board-1')
  })

  it('uses the authenticated actor and preserves the pay command body', async () => {
    const { controller, service } = make()
    const body = { paymentMethod: 'BANK', transactionReference: 'tx-1' } as never

    await controller.payPayment('payment-1', body, 'board-1')

    expect(service.payPayment).toHaveBeenCalledWith('payment-1', body, 'board-1')
  })

  it('uses the authenticated actor and preserves the cancellation reason', async () => {
    const { controller, service } = make()
    const body = { cancelReason: 'contract terminated' }

    await controller.cancelPayment('payment-1', body, 'admin-1')

    expect(service.cancelPayment).toHaveBeenCalledWith('payment-1', body, 'admin-1')
  })

  it.each([
    ['contract', (controller: PaymentController) => controller.getPaymentsByContract('ct-1', 'user-1', 'EDITOR')],
    ['series', (controller: PaymentController) => controller.getPaymentsBySeries('series-1', 'user-1', 'MANGAKA')],
    ['user', (controller: PaymentController) => controller.getPaymentsByUser('target-1', 'user-1', 'MANGAKA')]
  ])('forwards %s collection ownership context', async (scope, invoke) => {
    const { controller, service } = make()

    await invoke(controller)

    if (scope === 'contract') {
      expect(service.getPaymentsByContract).toHaveBeenCalledWith('ct-1', 'user-1', 'EDITOR')
    } else if (scope === 'series') {
      expect(service.getPaymentsBySeries).toHaveBeenCalledWith('series-1', 'user-1', 'MANGAKA')
    } else {
      expect(service.getPaymentsByUserId).toHaveBeenCalledWith('target-1', 'user-1', 'MANGAKA')
    }
  })
})
