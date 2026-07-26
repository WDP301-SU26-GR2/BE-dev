import type { OtpPurpose } from '@prisma/client'
import type { TransactionContext } from 'src/infrastructure/database/transaction-context'

export abstract class SigningOtpPort {
  abstract consumeSigningOtp(
    context: TransactionContext,
    command: { email: string; code: string; purpose: OtpPurpose }
  ): Promise<void>
}
