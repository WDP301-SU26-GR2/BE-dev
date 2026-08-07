import { OtpEmailPurpose, getOtpEmailContent } from './otp-email-content'

describe('getOtpEmailContent', () => {
  it.each([
    [OtpEmailPurpose.EMAIL_VERIFICATION, '[Nhà xuất bản Mangaka] Xác thực địa chỉ email của bạn'],
    [OtpEmailPurpose.PASSWORD_RESET, '[Nhà xuất bản Mangaka] Mã OTP đặt lại mật khẩu'],
    [OtpEmailPurpose.CONTRACT_SIGNATURE, '[Nhà xuất bản Mangaka] Mã OTP ký hợp đồng'],
    [OtpEmailPurpose.VOTE_CONFIRMATION, '[Nhà xuất bản Mangaka] Mã OTP xác nhận biểu quyết']
  ])('returns a purpose-specific Vietnamese subject for %s', (purpose, subject) => {
    expect(getOtpEmailContent(purpose, 'Nhà xuất bản Mangaka').subject).toBe(subject)
  })

  it('keeps queued OTP jobs from before the purpose field was added deliverable', () => {
    expect(getOtpEmailContent(undefined, 'Nhà xuất bản Mangaka').subject).toBe('[Nhà xuất bản Mangaka] Mã OTP của bạn')
  })
})
