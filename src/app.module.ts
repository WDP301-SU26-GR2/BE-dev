import { Module } from '@nestjs/common'
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { ZodSerializerInterceptor } from 'nestjs-zod'
import { CatchEverythingFilter } from 'src/shared/filters/catch-everything.filter'
import { HttpExceptionFilter } from 'src/shared/filters/http-exception.filter'
import CustomZodValidationPipe from 'src/shared/pipes/custom-zod-validation.pipe'
import { SharedModule } from 'src/shared/shared.module'
import { AuthModule } from './modules/auth/auth.module'

@Module({
  imports: [SharedModule, AuthModule],
  controllers: [],
  providers: [
    {
      provide: APP_PIPE,
      useClass: CustomZodValidationPipe // Sử dụng CustomZodValidationPipe để thay thế ZodValidationPipe mặc định, CustomZodValidationPipe sẽ trả về lỗi 422 Unprocessable Entity thay vì lỗi 400 Bad Request khi có lỗi validation xảy ra, điều này giúp cho client dễ dàng phân biệt được lỗi nào là lỗi validation và lỗi nào là lỗi khác, đồng thời cũng giúp tăng cường tính chính xác và rõ ràng của các phản hồi lỗi từ API
    },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter
    },
    {
      provide: APP_FILTER,
      useClass: CatchEverythingFilter // Sử dụng CatchEverythingFilter để bắt tất cả các lỗi chưa được xử lý trong ứng dụng, giúp cho việc xử lý lỗi trở nên dễ dàng hơn và đảm bảo rằng tất cả các lỗi đều được ghi log và trả về phản hồi lỗi phù hợp cho client, điều này cũng giúp tăng cường tính ổn định và độ tin cậy của ứng dụng của bạn.
    }
  ]
})
export class AppModule {}
