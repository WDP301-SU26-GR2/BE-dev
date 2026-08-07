import { Injectable } from '@nestjs/common'
import * as React from 'react'
import { Resend } from 'resend'
import envConfig from 'src/core/config/envConfig'
import AccountCredentialsEmail from './emails/account-credentials'
import OTPEmail from './emails/plaid-verify-identity'
import { getOtpEmailContent, OtpEmailPurposeType } from './otp-email-content'

@Injectable()
export class EmailService {
  private resend: Resend

  constructor() {
    this.resend = new Resend(envConfig.RESEND_API_KEY)
  }

  async sendOTP(payload: { email: string; code: string; expiresInMinutes: number; purpose?: OtpEmailPurposeType }) {
    const content = getOtpEmailContent(payload.purpose, `Nhà xuất bản ${envConfig.NAME_APP}`)
    return await this.resend.emails.send({
      from: envConfig.EMAIL_FROM,
      to: [payload.email],
      subject: content.subject,
      react: (
        <OTPEmail
          code={payload.code}
          title={content.subject}
          instruction={content.instruction}
          appName={envConfig.NAME_APP}
          logoUrl={envConfig.EMAIL_LOGO_URL}
          expiresInMinutes={payload.expiresInMinutes}
        />
      )
    })
  }

  async sendAccountCredentials(payload: { email: string; name: string; temporaryPassword: string }) {
    const subject = `[${envConfig.NAME_APP}] Tài khoản của bạn đã được tạo`
    return await this.resend.emails.send({
      from: envConfig.EMAIL_FROM,
      to: [payload.email],
      subject,
      react: (
        <AccountCredentialsEmail
          name={payload.name}
          email={payload.email}
          temporaryPassword={payload.temporaryPassword}
          title={subject}
          appName={envConfig.NAME_APP}
          logoUrl={envConfig.EMAIL_LOGO_URL}
        />
      )
    })
  }
}
