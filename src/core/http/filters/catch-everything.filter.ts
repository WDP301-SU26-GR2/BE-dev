import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { ZodSerializationException } from 'nestjs-zod'
import { ZodError } from 'zod'
import { isUniqueConstrainError } from 'src/infrastructure/database/prisma-error.helper'

// Bộ lọc lỗi DUY NHẤT của app (safety net). Chuẩn hóa MỌI lỗi về envelope nhất quán:
//   { success: false, statusCode, message }
// `message` được "nâng" từ HttpException.getResponse() (string hoặc mảng zod issues),
// KHÔNG bọc lại nguyên cục response của Nest (tránh object lồng object).
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
    let message: unknown

    if (exception instanceof HttpException) {
      httpStatus = exception.getStatus()
      message = extractMessage(exception.getResponse())
    } else if (isUniqueConstrainError(exception)) {
      httpStatus = HttpStatus.CONFLICT
      message = 'Record already exists'
    } else {
      httpStatus = HttpStatus.INTERNAL_SERVER_ERROR
      message = 'Internal server error'
      this.logger.error(
        'Unhandled exception occurred',
        exception instanceof Error ? exception.stack : String(exception)
      )
    }

    httpAdapter.reply(ctx.getResponse(), { success: false, statusCode: httpStatus, message }, httpStatus)
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
