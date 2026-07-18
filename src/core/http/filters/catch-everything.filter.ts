import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { ZodSerializationException } from 'nestjs-zod'
import { ZodError } from 'zod'
import { isUniqueConstrainError } from 'src/infrastructure/database/prisma-error.helper'
import { HttpMessages } from '../http.messages'
import { ERROR_TEXT_VI, isKnownCode, translateErrorCode } from '../docs/error-text.registry'

// Bộ lọc lỗi DUY NHẤT của app (safety net). Chuẩn hóa MỌI lỗi về envelope nhất quán:
//   { success: false, statusCode, code, message, errors? }
// `message` LUÔN là string (để FE hiển thị); khi lỗi có field-level issues (zod validation
// hoặc domain const-instance `{message,path}[]`) thì mảng issue được đặt ở `errors[]`,
// `message` = message của issue duy nhất, hoặc 'Validation failed' nếu có nhiều issue.
// KHÔNG bọc lại nguyên cục response của Nest (tránh object lồng object / message-trong-message).
@Catch()
export class CatchEverythingFilter implements ExceptionFilter {
  private readonly logger = new Logger(CatchEverythingFilter.name)

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost
    const ctx = host.switchToHttp()

    //Kiểm tra nếu exception là ZodSerializationException, log thông tin lỗi Zod
    if (exception instanceof ZodSerializationException) {
      const zodError = exception.getZodError()
      if (zodError instanceof ZodError) {
        this.logger.error(`ZodSerializationException: ${zodError.message}`)
      }
    }

    let httpStatus: number
    let extracted: unknown
    let extra: Record<string, unknown> | undefined

    if (exception instanceof HttpException) {
      // Lỗi của Nest (HttpException) → lấy status, message, extra
      httpStatus = exception.getStatus()
      const response = exception.getResponse()
      extracted = extractMessage(response)
      extra = extractExtra(response)
    } else if (isUniqueConstrainError(exception)) {
      // Lỗi unique constraint của Prisma → trả về 409 Conflict
      httpStatus = HttpStatus.CONFLICT
      extracted = HttpMessages.error.recordAlreadyExists
    } else {
      // Lỗi không xác định → trả về 500 Internal Server Error
      httpStatus = HttpStatus.INTERNAL_SERVER_ERROR
      extracted = HttpMessages.error.internalServerError
      this.logger.error(
        'Unhandled exception occurred',
        exception instanceof Error ? exception.stack : String(exception)
      )
    }

    httpAdapter.reply(ctx.getResponse(), buildErrorBody(httpStatus, extracted, extra), httpStatus)
  }
}

// getResponse() của Nest trả về string (vd `new ForbiddenException('Error.X')`)
// hoặc object `{ statusCode, message, error }`. Lấy phần `message` để đặt phẳng lên top-level.
function extractMessage(response: string | object): unknown {
  if (typeof response === 'string') {
    return response
  }
  if (response && typeof response === 'object' && 'message' in response) {
    return response.message
  }
  return response
}

// Lấy phần extra (ngoài message/statusCode/error) để trả về FE, nếu có.
function extractExtra(response: string | object): Record<string, unknown> | undefined {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return undefined
  }
  const extra = { ...(response as Record<string, unknown>) }
  delete extra.message
  delete extra.statusCode
  delete extra.error
  return Object.keys(extra).length > 0 ? extra : undefined
}

type FieldIssue = { message: string; path?: string }
// Kiểm tra xem value có phải là FieldIssue không (có message string, path optional)
function isFieldIssue(value: unknown): value is FieldIssue {
  return typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string'
}

// Lỗi field-level (zod/domain) là mảng `{message,path}` → tách sang `errors[]`, `message` thành string.
// Lỗi đơn (string) → giữ `message`, không kèm `errors`.
const missingTranslationLogger = new Logger('ErrorTextRegistry')
const warnedMissingCodes = new Set<string>()

function resolveMessage(message: string): { code: string | null; text: string } {
  if (message in ERROR_TEXT_VI) return { code: message, text: translateErrorCode(message) }
  if (isKnownCode(message)) {
    if (!warnedMissingCodes.has(message)) {
      warnedMissingCodes.add(message)
      missingTranslationLogger.warn(`missing VN text: ${message}`)
    }
    return { code: message, text: message }
  }
  return { code: null, text: message }
}

function withoutCode(extra?: Record<string, unknown>): Record<string, unknown> {
  if (!extra) return {}
  const rest = { ...extra }
  delete rest.code
  return rest
}

function buildErrorBody(statusCode: number, extracted: unknown, extra?: Record<string, unknown>) {
  const extraCode = typeof extra?.code === 'string' ? extra.code : undefined
  if (Array.isArray(extracted)) {
    const errors = extracted.filter(isFieldIssue).map((issue) => {
      const resolved = resolveMessage(issue.message)
      return { code: resolved.code, message: resolved.text, path: issue.path }
    })
    const single = errors.length === 1
    const code = extraCode ?? (single ? errors[0].code : null) ?? HttpMessages.error.validationFailed
    const message = single ? errors[0].message : HttpMessages.errorText['Error.ValidationFailed']
    return { success: false, statusCode, code, message, errors, ...withoutCode(extra) }
  }

  const resolved =
    typeof extracted === 'string' ? resolveMessage(extracted) : resolveMessage(HttpMessages.error.internalServerError)
  return {
    success: false,
    statusCode,
    code: extraCode ?? resolved.code ?? HttpMessages.error.internalServerError,
    message: resolved.text,
    ...withoutCode(extra)
  }
}
