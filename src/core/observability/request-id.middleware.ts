import { Injectable, NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { NextFunction, Request, Response } from 'express'
import { RequestContextService } from './request-context.service'

const REQUEST_ID_HEADER = 'x-request-id'

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const supplied = request.header(REQUEST_ID_HEADER)?.trim()
    const requestId = supplied && supplied.length <= 128 ? supplied : randomUUID()
    response.setHeader(REQUEST_ID_HEADER, requestId)
    this.requestContext.run(requestId, next)
  }
}
