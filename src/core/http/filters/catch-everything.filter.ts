import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { isUniqueConstrainError } from 'src/infrastructure/database/prisma-error.helper'

@Catch()
export class CatchEverythingFilter implements ExceptionFilter {
  private readonly logger = new Logger(CatchEverythingFilter.name)

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // In certain situations `httpAdapter` might not be available in the constructor.
    const { httpAdapter } = this.httpAdapterHost

    const ctx = host.switchToHttp()

    const isExpectedHttpException = exception instanceof HttpException
    const isKnownPrismaConflict = isUniqueConstrainError(exception)
    let httpStatus = isExpectedHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    let message = isExpectedHttpException ? exception.getResponse() : 'Internal server error'
    if (isKnownPrismaConflict) {
      httpStatus = HttpStatus.CONFLICT
      message = 'Record already exists'
    }

    if (!isExpectedHttpException && !isKnownPrismaConflict) {
      this.logger.error(
        'Unhandled exception occurred',
        exception instanceof Error ? exception.stack : String(exception)
      )
    }

    const responseBody = {
      statusCode: httpStatus,
      message
    }
    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus)
  }
}
