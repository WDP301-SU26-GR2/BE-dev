import { Injectable } from '@nestjs/common'
import { EmailService } from 'src/infrastructure/email/email.service'
import { GuestOtpDeliveryCommand, GuestOtpDeliveryPort } from '../ports/guest-otp-delivery.port'
import envConfig from 'src/core/config/envConfig'
import { VoteOtpDeliveryFailedException } from '../errors/survey.errors'

const DELIVERY_TIMEOUT_MS = 10_000

@Injectable()
export class GuestEmailOtpDeliveryService implements GuestOtpDeliveryPort {
  constructor(private readonly emailService: EmailService) {}

  async deliverEmailOtp(command: GuestOtpDeliveryCommand): Promise<void> {
    if (envConfig.NODE_ENV === 'test') return
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const delivery = this.emailService.sendOTP({
        email: command.recipient,
        code: command.code,
        expiresInMinutes: command.expiresInMinutes
      })
      const result = await Promise.race([
        delivery,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(VoteOtpDeliveryFailedException), DELIVERY_TIMEOUT_MS)
        })
      ])
      if (result?.error) throw VoteOtpDeliveryFailedException
    } catch {
      throw VoteOtpDeliveryFailedException
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }
}
