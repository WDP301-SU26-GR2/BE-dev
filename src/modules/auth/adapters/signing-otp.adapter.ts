import { Injectable } from '@nestjs/common'
import { transactionClient } from 'src/infrastructure/database/transaction-context'
import { HashingService } from 'src/infrastructure/crypto/hashing.service'
import { SigningOtpPort } from 'src/modules/transfer/ports/signing-otp.port'
import { AUTH_OTP_MAX_ATTEMPTS } from '../auth.constant'
import { InvalidOTPException, OTPExpiredException, OtpLockedException } from '../errors/auth.errors'

@Injectable()
export class SigningOtpAdapter implements SigningOtpPort {
  constructor(private readonly hashing: HashingService) {}

  async consumeSigningOtp(
    context: Parameters<SigningOtpPort['consumeSigningOtp']>[0],
    command: Parameters<SigningOtpPort['consumeSigningOtp']>[1]
  ): Promise<void> {
    const tx = transactionClient(context)
    const otp = await tx.otpRequest.findUnique({
      where: { email_purpose: { email: command.email, purpose: command.purpose } }
    })
    if (!otp || otp.isUsed) throw InvalidOTPException
    const now = new Date()
    if (otp.expiresAt <= now) throw OTPExpiredException
    if (otp.attempts >= AUTH_OTP_MAX_ATTEMPTS) throw OtpLockedException
    if (!(await this.hashing.compare(command.code, otp.otpCodeHash))) throw InvalidOTPException
    const consumed = await tx.otpRequest.deleteMany({
      where: { id: otp.id, purpose: command.purpose, isUsed: false, expiresAt: { gt: now } }
    })
    if (consumed.count !== 1) throw InvalidOTPException
  }
}
