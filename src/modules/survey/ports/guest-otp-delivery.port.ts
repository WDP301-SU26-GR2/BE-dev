export type GuestOtpDeliveryCommand = {
  recipient: string
  code: string
  expiresInMinutes: number
}

export abstract class GuestOtpDeliveryPort {
  abstract deliverEmailOtp(command: GuestOtpDeliveryCommand): Promise<void>
}
