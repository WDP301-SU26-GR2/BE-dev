import envConfig from 'src/core/config/envConfig'
import { GuestEmailOtpDeliveryService } from './guest-email-otp-delivery.service'

describe('GuestEmailOtpDeliveryService', () => {
  const originalNodeEnv = envConfig.NODE_ENV

  afterEach(() => {
    envConfig.NODE_ENV = originalNodeEnv
    jest.useRealTimers()
  })

  it('does not contact the email provider in tests', async () => {
    envConfig.NODE_ENV = 'test'
    const emailService = { sendOTP: jest.fn() }
    const service = new GuestEmailOtpDeliveryService(emailService as never)

    await service.deliverEmailOtp({ recipient: 'reader@example.com', code: '123456', expiresInMinutes: 5 })

    expect(emailService.sendOTP).not.toHaveBeenCalled()
  })

  it('passes only the delivery command to the provider outside tests', async () => {
    envConfig.NODE_ENV = 'development'
    const emailService = { sendOTP: jest.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null }) }
    const service = new GuestEmailOtpDeliveryService(emailService as never)
    const command = { recipient: 'reader@example.com', code: '123456', expiresInMinutes: 5 }

    await service.deliverEmailOtp(command)

    expect(emailService.sendOTP).toHaveBeenCalledWith({
      email: command.recipient,
      code: command.code,
      expiresInMinutes: command.expiresInMinutes
    })
  })

  it('rejects when the provider resolves with an error result', async () => {
    envConfig.NODE_ENV = 'development'
    const emailService = {
      sendOTP: jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'provider rejected request' }
      })
    }
    const service = new GuestEmailOtpDeliveryService(emailService as never)

    await expect(
      service.deliverEmailOtp({
        recipient: 'reader@example.com',
        code: '123456',
        expiresInMinutes: 5
      })
    ).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({ message: 'Error.VoteOtpDeliveryFailed' })
    })
  })

  it('fails closed when the provider does not settle before the delivery timeout', async () => {
    jest.useFakeTimers()
    envConfig.NODE_ENV = 'development'
    const emailService = { sendOTP: jest.fn(() => new Promise(() => undefined)) }
    const service = new GuestEmailOtpDeliveryService(emailService as never)

    const delivery = service.deliverEmailOtp({
      recipient: 'reader@example.com',
      code: '123456',
      expiresInMinutes: 5
    })
    const expectation = expect(delivery).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({ message: 'Error.VoteOtpDeliveryFailed' })
    })
    await jest.advanceTimersByTimeAsync(10_000)

    await expectation
  })
})
