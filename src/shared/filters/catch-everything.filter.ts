import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { isUniqueConstrainError } from 'src/shared/database/prisma-error.helper'

//tấm lưới bảo hiểm" cuối cùng của cả hệ thống
// Bất kể lỗi gì xảy ra ở bất kỳ ngóc ngách nào trong code Backend của bạn mà bạn chưa kịp bắt (try...catch), nó đều sẽ nhảy ra hứng trọn.
@Catch()
export class CatchEverythingFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // In certain situations `httpAdapter` might not be available in the
    // constructor method, thus we should resolve it here.
    const { httpAdapter } = this.httpAdapterHost

    const ctx = host.switchToHttp()

    let httpStatus = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    let message = exception instanceof HttpException ? exception.getResponse() : 'Internal server error'
    if (isUniqueConstrainError(exception)) {
      httpStatus = HttpStatus.CONFLICT
      message = 'Record already exists'
    }

    const responseBody = {
      statusCode: httpStatus,
      message
    }
    console.log('Unhandled exception occurred:', exception)
    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus)
  }
}
