import { Injectable } from '@nestjs/common'
import * as React from 'react'
import { Resend } from 'resend'
import envConfig from '../config/envConfig'
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
      to: [payload.email], //Địa chỉ email người nhận, có thể là một chuỗi hoặc một mảng các chuỗi, chỉ gửi đc khi đã verify domain
      subject: subject,
      react: <OTPEmail code={payload.code} title={subject} />
      // html: otpTemplate.replaceAll('{{code}}', payload.code).replaceAll('{{subject}}', subject),
    })
  }
}
