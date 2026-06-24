import * as React from 'react'
import { Body, Container, Head, Heading, Html, Img, Section, Text } from 'react-email'

interface AccountCredentialsEmailProps {
  name?: string
  email?: string
  temporaryPassword?: string
  title?: string
}

const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''

export const AccountCredentialsEmail = ({ name, email, temporaryPassword, title }: AccountCredentialsEmailProps) => (
  <Html>
    <Head>
      <title>{title || '[Mangaka System] Tài khoản của bạn đã được tạo'}</title>
    </Head>
    <Body style={main}>
      <Container style={container}>
        <Img src={`${baseUrl}/static/plaid-logo.png`} width="212" height="88" alt="logo" style={logo} />
        <Text style={tertiary}>Mangaka System</Text>
        <Heading style={secondary}>Xin chào {name || 'bạn'}, tài khoản của bạn đã được tạo.</Heading>
        <Section style={infoBox}>
          <Text style={infoLabel}>Email đăng nhập</Text>
          <Text style={emailValue}>{email}</Text>
        </Section>
        <Section style={passwordContainer}>
          <Text style={infoLabel}>Mật khẩu tạm</Text>
          <Text style={passwordValue}>{temporaryPassword}</Text>
        </Section>
        <Text style={paragraph}>
          Vì lý do bảo mật, bạn sẽ được yêu cầu đổi mật khẩu ngay trong lần đăng nhập đầu tiên.
        </Text>
      </Container>
      <Text style={footer}>Mangaka System</Text>
    </Body>
  </Html>
)

AccountCredentialsEmail.PreviewProps = {
  name: 'Editor A',
  email: 'editor@example.com',
  temporaryPassword: 'Temp1234',
  title: 'Tài khoản của bạn đã được tạo'
} as AccountCredentialsEmailProps

export default AccountCredentialsEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif'
}

const container = {
  backgroundColor: '#ffffff',
  border: '1px solid #eee',
  borderRadius: '5px',
  boxShadow: '0 5px 10px rgba(20,50,70,.2)',
  marginTop: '20px',
  maxWidth: '420px',
  marginLeft: 'auto',
  marginRight: 'auto',
  padding: '48px 0 60px'
}

const logo = {
  margin: '0 auto'
}

const tertiary = {
  color: '#0a85ea',
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  textAlign: 'center' as const,
  margin: '8px'
}

const secondary = {
  color: '#000',
  fontSize: '18px',
  fontWeight: 500,
  lineHeight: '24px',
  textAlign: 'center' as const,
  padding: '0 24px'
}

const infoBox = {
  background: 'rgba(0,0,0,.05)',
  borderRadius: '4px',
  margin: '16px auto',
  padding: '12px 20px',
  width: '320px'
}

const infoLabel = {
  color: '#666',
  fontSize: '12px',
  margin: '8px 0 0',
  textTransform: 'uppercase' as const
}

const emailValue = {
  color: '#000',
  fontSize: '16px',
  fontWeight: 500,
  margin: '0'
}

const passwordContainer = {
  background: 'rgba(10,133,234,.1)',
  border: '2px solid #0a85ea',
  borderRadius: '4px',
  margin: '16px auto',
  padding: '16px 20px',
  width: '320px'
}

const passwordValue = {
  color: '#0a85ea',
  fontSize: '28px',
  fontWeight: 800,
  fontFamily: 'HelveticaNeue-Bold,Helvetica,Arial,sans-serif',
  letterSpacing: '3px',
  margin: '4px 0 0'
}

const paragraph = {
  color: '#444',
  fontSize: '14px',
  lineHeight: '22px',
  padding: '0 32px',
  textAlign: 'center' as const
}

const footer = {
  color: '#000',
  fontSize: '12px',
  fontWeight: 800,
  textAlign: 'center' as const,
  textTransform: 'uppercase' as const,
  marginTop: '20px'
}
