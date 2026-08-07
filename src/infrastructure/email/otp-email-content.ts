export const OtpEmailPurpose = {
  EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
  PASSWORD_RESET: 'PASSWORD_RESET',
  CONTRACT_SIGNATURE: 'CONTRACT_SIGNATURE',
  VOTE_CONFIRMATION: 'VOTE_CONFIRMATION'
} as const

export type OtpEmailPurposeType = (typeof OtpEmailPurpose)[keyof typeof OtpEmailPurpose]

interface OtpEmailContent {
  subject: string
  instruction: string
}

export function getOtpEmailContent(purpose: OtpEmailPurposeType | undefined, publisherName: string): OtpEmailContent {
  const prefix = `[${publisherName}]`

  if (!purpose) {
    return {
      subject: `${prefix} Mã OTP của bạn`,
      instruction: 'Nhập mã sau vào ứng dụng để xác thực danh tính của bạn.'
    }
  }

  switch (purpose) {
    case OtpEmailPurpose.EMAIL_VERIFICATION:
      return {
        subject: `${prefix} Xác thực địa chỉ email của bạn`,
        instruction: 'Nhập mã sau vào ứng dụng để xác thực địa chỉ email của bạn.'
      }
    case OtpEmailPurpose.PASSWORD_RESET:
      return {
        subject: `${prefix} Mã OTP đặt lại mật khẩu`,
        instruction: 'Nhập mã sau vào ứng dụng để đặt lại mật khẩu của bạn.'
      }
    case OtpEmailPurpose.CONTRACT_SIGNATURE:
      return {
        subject: `${prefix} Mã OTP ký hợp đồng`,
        instruction: 'Nhập mã sau vào ứng dụng để ký hợp đồng hoặc phụ lục hợp đồng.'
      }
    case OtpEmailPurpose.VOTE_CONFIRMATION:
      return {
        subject: `${prefix} Mã OTP xác nhận biểu quyết`,
        instruction: 'Nhập mã sau vào ứng dụng để xác nhận biểu quyết của bạn.'
      }
  }
}
