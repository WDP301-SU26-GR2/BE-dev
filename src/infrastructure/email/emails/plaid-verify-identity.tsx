import * as React from 'react'
import { Body, Container, Head, Heading, Html, Img, Section, Text } from 'react-email'

interface OtpEmailProps {
  code?: string
  title?: string
  appName?: string
  // Use a publicly deployed image URL; local paths do not render in email clients.
  logoUrl?: string
  expiresInMinutes?: number
}

export const OTPEmail = ({ code, title, appName = 'Mangaka', logoUrl, expiresInMinutes = 5 }: OtpEmailProps) => (
  <Html>
    <Head>
      <title>{title || `Your ${appName} verification code`}</title>
    </Head>
    <Body style={main}>
      <Container style={container}>
        {logoUrl ? (
          <Img src={logoUrl} width="212" height="88" alt={appName} style={logo} />
        ) : (
          <Text style={brand}>{appName}</Text>
        )}
        <Text style={tertiary}>Verification code</Text>
        <Heading style={secondary}>
          Enter the following code in the app to verify your identity. This code expires in {expiresInMinutes}{' '}
          {expiresInMinutes === 1 ? 'minute' : 'minutes'}.
        </Heading>
        <Section style={codeContainer}>
          <Text style={codeText}>{code}</Text>
        </Section>
        <Text style={paragraph}>If you did not request this code, you can safely ignore this email.</Text>
      </Container>
      <Text style={footer}>{appName}</Text>
    </Body>
  </Html>
)

OTPEmail.PreviewProps = {
  code: '144833',
  title: 'Your Mangaka verification code',
  appName: 'Mangaka',
  expiresInMinutes: 5
} as OtpEmailProps

export default OTPEmail

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
  maxWidth: '360px',
  margin: '0 auto',
  padding: '68px 0 130px'
}

const logo = {
  margin: '0 auto'
}

const brand = {
  color: '#0a85ea',
  fontSize: '28px',
  fontWeight: 800,
  fontFamily: 'HelveticaNeue-Bold,Helvetica,Arial,sans-serif',
  letterSpacing: '1px',
  textAlign: 'center' as const,
  margin: '0 auto'
}

const tertiary = {
  color: '#0a85ea',
  fontSize: '11px',
  fontWeight: 700,
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif',
  height: '16px',
  letterSpacing: '0',
  lineHeight: '16px',
  margin: '16px 8px 8px 8px',
  textTransform: 'uppercase' as const,
  textAlign: 'center' as const
}

const secondary = {
  color: '#000',
  display: 'inline-block',
  fontFamily: 'HelveticaNeue-Medium,Helvetica,Arial,sans-serif',
  fontSize: '20px',
  fontWeight: 500,
  lineHeight: '24px',
  marginBottom: '0',
  marginTop: '0',
  textAlign: 'center' as const
}

const codeContainer = {
  background: 'rgba(0,0,0,.05)',
  borderRadius: '4px',
  margin: '16px auto 14px',
  verticalAlign: 'middle',
  width: '280px'
}

const codeText = {
  color: '#000',
  display: 'inline-block',
  fontFamily: 'HelveticaNeue-Bold',
  fontSize: '32px',
  fontWeight: 700,
  letterSpacing: '6px',
  lineHeight: '40px',
  paddingBottom: '8px',
  paddingTop: '8px',
  margin: '0 auto',
  width: '100%',
  textAlign: 'center' as const
}

const paragraph = {
  color: '#444',
  fontSize: '15px',
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif',
  letterSpacing: '0',
  lineHeight: '23px',
  padding: '0 40px',
  margin: '0',
  textAlign: 'center' as const
}

const footer = {
  color: '#000',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '0',
  lineHeight: '23px',
  margin: '0',
  marginTop: '20px',
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif',
  textAlign: 'center' as const,
  textTransform: 'uppercase' as const
}
