import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { ZodSerializationException } from 'nestjs-zod'
import { ZodError } from 'zod'
import { isUniqueConstrainError } from 'src/infrastructure/database/prisma-error.helper'
import { HttpMessages } from '../http.messages'

// Bộ lọc lỗi DUY NHẤT của app (safety net). Chuẩn hóa MỌI lỗi về envelope nhất quán:
//   { success: false, statusCode, message, errors? }
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

    if (exception instanceof ZodSerializationException) {
      const zodError = exception.getZodError()
      if (zodError instanceof ZodError) {
        this.logger.error(`ZodSerializationException: ${zodError.message}`)
      }
    }

    let httpStatus: number
    let extracted: unknown

    if (exception instanceof HttpException) {
      httpStatus = exception.getStatus()
      extracted = extractMessage(exception.getResponse())
    } else if (isUniqueConstrainError(exception)) {
      httpStatus = HttpStatus.CONFLICT
      extracted = HttpMessages.recordAlreadyExists
    } else {
      httpStatus = HttpStatus.INTERNAL_SERVER_ERROR
      extracted = HttpMessages.internalServerError
      this.logger.error(
        'Unhandled exception occurred',
        exception instanceof Error ? exception.stack : String(exception)
      )
    }

    httpAdapter.reply(ctx.getResponse(), buildErrorBody(httpStatus, extracted), httpStatus)
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

type FieldIssue = { message: string; path?: string }

function isFieldIssue(value: unknown): value is FieldIssue {
  return typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string'
}

// Lỗi field-level (zod/domain) là mảng `{message,path}` → tách sang `errors[]`, `message` thành string.
// Lỗi đơn (string) → giữ `message`, không kèm `errors`.
function buildErrorBody(statusCode: number, extracted: unknown) {
  if (Array.isArray(extracted)) {
    const errors = extracted as FieldIssue[]
    const message = errors.length === 1 && isFieldIssue(errors[0]) ? errors[0].message : HttpMessages.validationFailed
    return { success: false, statusCode, message, errors }
  }
  return { success: false, statusCode, message: extracted }
}
