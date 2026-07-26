import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common'
import type { Request, Response } from 'express'
import { Observable, tap } from 'rxjs'
import { RuntimeMetricsService } from 'src/core/observability/runtime-metrics.service'

@Injectable()
export class RuntimeMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: RuntimeMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle()
    const http = context.switchToHttp()
    const request = http.getRequest<Request>()
    const response = http.getResponse<Response>()
    const startedAt = process.hrtime.bigint()
    const route = this.routeLabel(context, request)

    return next.handle().pipe(
      tap({
        next: () => this.record(request.method, route, response.statusCode, startedAt),
        error: (error: unknown) =>
          this.record(request.method, route, error instanceof HttpException ? error.getStatus() : 500, startedAt)
      })
    )
  }

  private record(method: string, route: string, statusCode: number, startedAt: bigint): void {
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000
    this.metrics.recordHttp({ method, route, statusCode, durationSeconds })
  }

  private routeLabel(context: ExecutionContext, request: Request): string {
    const routePath = request.route && typeof request.route.path === 'string' ? request.route.path : undefined
    if (routePath) return `${request.baseUrl ?? ''}${routePath}` || '/'
    return `${context.getClass().name}.${context.getHandler().name}`
  }
}
