import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

// FIle này định nghĩa các hàm helper để kiểm tra lỗi của Prisma, ví dụ như lỗi vi phạm ràng buộc duy nhất (unique constraint violation) hoặc lỗi không tìm thấy bản ghi (not found error). Các hàm này sẽ giúp cho việc xử lý lỗi trong service trở nên dễ dàng hơn và mã nguồn trở nên sạch hơn.
export function isUniqueConstrainError(error: any): error is PrismaClientKnownRequestError {
  return error instanceof PrismaClientKnownRequestError && error.code === 'P2002'
}

export function isNotFoundError(error: any): error is PrismaClientKnownRequestError {
  return error instanceof PrismaClientKnownRequestError && error.code === 'P2025'
}
