import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

export interface ResponseEnvelope<T = unknown> {
  success: true
  message: string
  data: T
}

const DEFAULT_MESSAGE = 'Success'

// Bọc MỌI response thành công về một envelope nhất quán: { success, message, data }.
// Nếu payload là object có field `message` (string) → nâng lên top-level, phần còn lại làm `data`
// (null nếu không còn field nào). Ngược lại → message mặc định, payload nguyên vẹn làm `data`.
//
// ⚠️ Phải đăng ký TRƯỚC ZodSerializerInterceptor để Zod serialize DTO xong rồi envelope mới bọc.
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<ResponseEnvelope> {
    return next.handle().pipe(map((payload: unknown) => toEnvelope(payload)))
  }
}

function toEnvelope(payload: unknown): ResponseEnvelope {
  const isPlainObject = payload !== null && typeof payload === 'object' && !Array.isArray(payload)

  if (isPlainObject && typeof (payload as Record<string, unknown>).message === 'string') {
    const { message, ...rest } = payload as Record<string, unknown> & { message: string }
    return { success: true, message, data: Object.keys(rest).length > 0 ? rest : null }
  }

  return { success: true, message: DEFAULT_MESSAGE, data: payload ?? null }
}
