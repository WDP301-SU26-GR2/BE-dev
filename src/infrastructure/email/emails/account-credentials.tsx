import * as React from 'react'
import { Body, Container, Head, Heading, Html, Img, Section, Text } from 'react-email'

interface AccountCredentialsEmailProps {
  name?: string
  email?: string
  temporaryPassword?: string
  title?: string
  appName?: string
  // Use a publicly deployed image URL; local paths do not render in email clients.
  logoUrl?: string
}

export const AccountCredentialsEmail = ({
  name,
  email,
  temporaryPassword,
  title,
  appName = 'Mangaka',
  logoUrl
}: AccountCredentialsEmailProps) => (
  <Html>
    <Head>
      <title>{title || `[${appName}] Your account has been created`}</title>
    </Head>
    <Body style={main}>
      <Container style={container}>
        {logoUrl ? (
          <Img src={logoUrl} width="212" height="88" alt={appName} style={logo} />
        ) : (
          <Text style={brand}>{appName}</Text>
        )}
        <Text style={tertiary}>{appName}</Text>
        <Heading style={secondary}>Hi {name || 'there'}, your account has been created.</Heading>
        <Section style={infoBox}>
          <Text style={infoLabel}>Login email</Text>
          <Text style={emailValue}>{email}</Text>
        </Section>
        <Section style={passwordContainer}>
          <Text style={infoLabel}>Temporary password</Text>
          <Text style={passwordValue}>{temporaryPassword}</Text>
        </Section>
        <Text style={paragraph}>
          For security reasons, you will be asked to change your password on your first sign-in.
        </Text>
      </Container>
      <Text style={footer}>{appName}</Text>
    </Body>
  </Html>
)

AccountCredentialsEmail.PreviewProps = {
  name: 'Editor A',
  email: 'editor@example.com',
  temporaryPassword: 'Temp1234',
  title: 'Your account has been created',
  appName: 'Mangaka'
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
