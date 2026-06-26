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

  async sendOTP(payload: { email: string; code: string; expiresInMinutes: number }) {
    const subject = `Your ${envConfig.NAME_APP} verification code`
    return await this.resend.emails.send({
      from: envConfig.EMAIL_FROM,
      to: [payload.email],
      subject,
      react: (
        <OTPEmail
          code={payload.code}
          title={subject}
          appName={envConfig.NAME_APP}
          logoUrl={envConfig.EMAIL_LOGO_URL}
          expiresInMinutes={payload.expiresInMinutes}
        />
      )
    })
  }

  async sendAccountCredentials(payload: { email: string; name: string; temporaryPassword: string }) {
    const subject = `[${envConfig.NAME_APP}] Your account has been created`
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
