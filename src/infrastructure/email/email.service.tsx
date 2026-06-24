import { Injectable } from '@nestjs/common'
import * as React from 'react'
import { Resend } from 'resend'
import envConfig from 'src/core/config/envConfig'
import AccountCredentialsEmail from './emails/account-credentials'
import OTPEmail from './emails/plaid-verify-identity'

@Injectable()
export class EmailService {
  private resend: Resend

  constructor() {
    this.resend = new Resend(envConfig.RESEND_API_KEY)
  }

  async sendOTP(payload: { email: string; code: string }) {
    const subject = 'Your OTP Code'
    return await this.resend.emails.send({
      from: 'Ecom web <ecom@novaproj.site>',
      to: [payload.email],
      subject: subject,
      react: <OTPEmail code={payload.code} title={subject} />
    })
  }

  async sendAccountCredentials(payload: { email: string; name: string; temporaryPassword: string }) {
    const subject = '[Mangaka System] Tài khoản của bạn đã được tạo'
    return await this.resend.emails.send({
      from: 'Ecom web <ecom@novaproj.site>',
      to: [payload.email],
      subject,
      react: (
        <AccountCredentialsEmail
          name={payload.name}
          email={payload.email}
          temporaryPassword={payload.temporaryPassword}
          title={subject}
        />
      )
    })
  }
}
