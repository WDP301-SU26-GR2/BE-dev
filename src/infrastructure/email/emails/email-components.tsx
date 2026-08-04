import * as React from 'react'

interface HtmlProps {
  children: React.ReactNode
}

export const Html = ({ children }: HtmlProps) => (
  <html lang="vi">
    {children}
  </html>
)

interface HeadProps {
  children?: React.ReactNode
}

export const Head = ({ children }: HeadProps) => (
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
    {children}
  </head>
)

interface BodyProps {
  children: React.ReactNode
  style?: React.CSSProperties
}

export const Body = ({ children, style }: BodyProps) => (
  <body style={style}>{children}</body>
)

interface ContainerProps {
  children: React.ReactNode
  style?: React.CSSProperties
}

export const Container = ({ children, style }: ContainerProps) => (
  <table
    width="100%"
    cellPadding="0"
    cellSpacing="0"
    style={{ ...defaultContainer, ...style }}
  >
    <tbody>
      <tr>
        <td align="center">{children}</td>
      </tr>
    </tbody>
  </table>
)

const defaultContainer: React.CSSProperties = {
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

interface SectionProps {
  children: React.ReactNode
  style?: React.CSSProperties
}

export const Section = ({ children, style }: SectionProps) => (
  <table
    width="100%"
    cellPadding="0"
    cellSpacing="0"
    style={style}
  >
    <tbody>
      <tr>
        <td>{children}</td>
      </tr>
    </tbody>
  </table>
)

interface TextProps {
  children: React.ReactNode
  style?: React.CSSProperties
}

export const Text = ({ children, style }: TextProps) => (
  <span style={{ ...defaultText, ...style }}>{children}</span>
)

const defaultText: React.CSSProperties = {
  color: '#000',
  fontSize: '14px',
  fontFamily: 'HelveticaNeue,Helvetica,Arial,sans-serif',
  lineHeight: '24px',
  margin: '0',
  padding: '0'
}

interface HeadingProps {
  children: React.ReactNode
  style?: React.CSSProperties
}

export const Heading = ({ children, style }: HeadingProps) => (
  <h2 style={{ ...defaultHeading, ...style }}>{children}</h2>
)

const defaultHeading: React.CSSProperties = {
  color: '#000',
  fontSize: '18px',
  fontWeight: 500,
  lineHeight: '24px',
  textAlign: 'center',
  padding: '0 24px',
  margin: '0 0 16px 0'
}

interface ImgProps {
  src: string
  width?: number | string
  height?: number | string
  alt: string
  style?: React.CSSProperties
}

export const Img = ({ src, width = 212, height = 88, alt, style }: ImgProps) => (
  <img
    src={src}
    width={width}
    height={height}
    alt={alt}
    style={{ ...defaultImg, ...style }}
  />
)

const defaultImg: React.CSSProperties = {
  margin: '0 auto',
  display: 'block'
}
