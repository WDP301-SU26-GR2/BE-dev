import { LoggerService } from '@nestjs/common'
import { RequestContextService } from './request-context.service'

type StructuredLogLevel = 'debug' | 'error' | 'fatal' | 'info' | 'verbose' | 'warn'

type StructuredLogEntry = {
  timestamp: string
  level: StructuredLogLevel
  service: string
  context: string
  message: string
  requestId?: string
}

const DEFAULT_CONTEXT = 'Application'
const NON_STRING_MESSAGE = '[non-string message]'
const REDACTED = '[REDACTED]'
const MAX_MESSAGE_LENGTH = 2_000
const MAX_CONTEXT_LENGTH = 120
const MAX_REQUEST_ID_LENGTH = 128

export class StructuredJsonLogger implements LoggerService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly service = 'mangaka-api'
  ) {}

  log(message: unknown, context?: string): void {
    this.write('info', message, context)
  }

  error(message: unknown, _trace?: string, context?: string): void {
    this.write('error', message, context)
  }

  warn(message: unknown, context?: string): void {
    this.write('warn', message, context)
  }

  debug(message: unknown, context?: string): void {
    this.write('debug', message, context)
  }

  verbose(message: unknown, context?: string): void {
    this.write('verbose', message, context)
  }

  fatal(message: unknown, context?: string): void {
    this.write('fatal', message, context)
  }

  private write(level: StructuredLogLevel, value: unknown, context?: string): void {
    const requestId = this.sanitizeRequestId(this.requestContext.getRequestId())
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.sanitizeService(this.service),
      context: this.sanitizeContext(context),
      message: this.sanitizeMessage(value),
      ...(requestId ? { requestId } : {})
    }
    const line = `${JSON.stringify(entry)}\n`
    const destination = level === 'error' || level === 'fatal' ? process.stderr : process.stdout
    destination.write(line)
  }

  private sanitizeMessage(value: unknown): string {
    const message = value instanceof Error ? value.message : typeof value === 'string' ? value : NON_STRING_MESSAGE
    const redacted = message
      .replace(/\bBearer\s+\S+/gi, `Bearer ${REDACTED}`)
      .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
      .replace(
        /\b(access[_-]?token|refresh[_-]?token|token|password|secret|api[_-]?key|authorization)\b\s*[:=]\s*["']?[^,\s}"']+/gi,
        (_match, key: string) => `${key}=${REDACTED}`
      )
    return this.stripControlCharacters(redacted).slice(0, MAX_MESSAGE_LENGTH)
  }

  private sanitizeContext(context?: string): string {
    if (!context) return DEFAULT_CONTEXT
    const sanitized = context.replace(/[^\w.:/-]/g, '').slice(0, MAX_CONTEXT_LENGTH)
    return sanitized || DEFAULT_CONTEXT
  }

  private sanitizeService(service: string): string {
    const sanitized = service.replace(/[^\w.-]/g, '').slice(0, MAX_CONTEXT_LENGTH)
    return sanitized || 'api'
  }

  private sanitizeRequestId(requestId?: string): string | undefined {
    if (!requestId) return undefined
    const sanitized = this.stripControlCharacters(requestId).slice(0, MAX_REQUEST_ID_LENGTH)
    return sanitized || undefined
  }

  private stripControlCharacters(value: string): string {
    return [...value]
      .filter((character) => {
        const code = character.charCodeAt(0)
        return code >= 32 && code !== 127
      })
      .join('')
  }
}
