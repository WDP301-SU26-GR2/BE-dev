import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

// FIle này định nghĩa các hàm helper để kiểm tra lỗi của Prisma, ví dụ như lỗi vi phạm ràng buộc duy nhất (unique constraint violation) hoặc lỗi không tìm thấy bản ghi (not found error). Các hàm này sẽ giúp cho việc xử lý lỗi trong service trở nên dễ dàng hơn và mã nguồn trở nên sạch hơn.
export function isUniqueConstrainError(error: any): error is PrismaClientKnownRequestError {
  return error instanceof PrismaClientKnownRequestError && error.code === 'P2002'
}

export function isNotFoundError(error: any): error is PrismaClientKnownRequestError {
  return error instanceof PrismaClientKnownRequestError && error.code === 'P2025'
}

/**
 * Prisma maps MongoDB write conflicts/deadlocks raised by concurrent transactions to P2034.
 * These failures are safe to retry only when the caller retries the whole transaction body.
 */
export function isRetryableTransactionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { code?: unknown; message?: unknown }
  return (
    candidate.code === 'P2034' ||
    (typeof candidate.message === 'string' &&
      (candidate.message.includes('TransientTransactionError') || candidate.message.includes('WriteConflict')))
  )
}
