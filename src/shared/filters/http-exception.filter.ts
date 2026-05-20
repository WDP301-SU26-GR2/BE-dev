import { Logger, Catch, ArgumentsHost, HttpException } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { ZodSerializationException } from 'nestjs-zod'
import { ZodError } from 'zod'

//class này sẽ bắt tất cả các lỗi HttpException và kiểm tra xem có phải lỗi đó là ZodSerializationException hay không. Nếu đúng, nó sẽ lấy thông tin lỗi từ ZodError và ghi log lỗi đó. Sau đó, nó sẽ gọi phương thức catch của BaseExceptionFilter để xử lý lỗi theo cách mặc định của NestJS. Điều này giúp bạn có thể dễ dàng theo dõi và xử lý các lỗi liên quan đến việc serialize dữ liệu bằng Zod trong ứng dụng của mình.
@Catch(HttpException)
export class HttpExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: HttpException, host: ArgumentsHost) {
    if (exception instanceof ZodSerializationException) {
      const zodError = exception.getZodError()
      if (zodError instanceof ZodError) {
        this.logger.error(`ZodSerializationException: ${zodError.message}`)
      }
    }

    super.catch(exception, host)
  }
}
