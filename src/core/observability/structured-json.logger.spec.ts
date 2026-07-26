import { RequestContextService } from './request-context.service'
import { StructuredJsonLogger } from './structured-json.logger'

type LogEntry = {
  timestamp: string
  level: string
  service: string
  context: string
  message: string
  requestId?: string
}

describe('StructuredJsonLogger', () => {
  let stdout: jest.SpyInstance
  let stderr: jest.SpyInstance
  let context: RequestContextService
  let logger: StructuredJsonLogger

  beforeEach(() => {
    stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    context = new RequestContextService()
    logger = new StructuredJsonLogger(context)
  })

  afterEach(() => {
    stdout.mockRestore()
    stderr.mockRestore()
  })

  it('writes one JSON line with the active request ID', () => {
    context.run('request-123', () => logger.log('application ready', 'Bootstrap'))

    expect(stderr).not.toHaveBeenCalled()
    const entry = parseLine(stdout)
    expect(entry).toMatchObject({
      level: 'info',
      service: 'mangaka-api',
      context: 'Bootstrap',
      message: 'application ready',
      requestId: 'request-123'
    })
    expect(Number.isNaN(Date.parse(entry.timestamp))).toBe(false)
  })

  it('writes errors to stderr without serializing raw objects or traces', () => {
    logger.error({ password: 'do-not-log', token: 'do-not-log' }, 'trace with raw details', 'AuthService')

    expect(stdout).not.toHaveBeenCalled()
    const line = String(stderr.mock.calls[0][0])
    const entry = parseJson(line)
    expect(entry).toMatchObject({
      level: 'error',
      context: 'AuthService',
      message: '[non-string message]'
    })
    expect(line).not.toContain('do-not-log')
    expect(line).not.toContain('trace with raw details')
  })

  it('redacts bearer tokens, JWTs and sensitive assignments from string messages', () => {
    logger.warn(
      'authorization: Bearer abc.def.ghi password=hunter2 access_token=eyJhbGciOiJIUzI1NiJ9.payload.signature',
      'Security'
    )

    const line = String(stdout.mock.calls[0][0])
    const entry = parseJson(line)
    expect(entry.message).toContain('[REDACTED]')
    expect(line).not.toContain('hunter2')
    expect(line).not.toContain('abc.def.ghi')
    expect(line).not.toContain('eyJhbGciOiJIUzI1NiJ9')
  })
})

function parseLine(spy: jest.SpyInstance): LogEntry {
  return parseJson(String(spy.mock.calls[0][0]))
}

function parseJson(line: string): LogEntry {
  expect(line.endsWith('\n')).toBe(true)
  return JSON.parse(line) as LogEntry
}
