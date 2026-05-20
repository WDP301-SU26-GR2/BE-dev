import { UnprocessableEntityException } from '@nestjs/common'
import { createZodValidationPipe } from 'nestjs-zod'
import { ZodError } from 'zod'

//hàm này sẽ tạo ra một CustomZodValidationPipe bằng cách sử dụng hàm createZodValidationPipe từ thư viện nestjs-zod.
//  Trong quá trình tạo pipe, chúng ta cung cấp một factory function để tạo ra một exception tùy chỉnh khi có lỗi
//  validation xảy ra. Nếu lỗi không phải là một instance của ZodError, chúng ta sẽ trả về một UnprocessableEntityException với lỗi gốc. Nếu lỗi là một instance của ZodError, chúng ta sẽ trả về một UnprocessableEntityException với một mảng các vấn đề lỗi đã được định dạng lại, trong đó mỗi vấn đề sẽ có đường dẫn được nối thành chuỗi thay vì mảng. Điều này giúp cho việc xử lý lỗi trở nên dễ dàng hơn khi làm việc với các schema validation của Zod trong ứng dụng NestJS của bạn.
const CustomZodValidationPipe: any = createZodValidationPipe({
  // provide custom validation exception factory
  createValidationException: (error: unknown) => {
    if (!(error instanceof ZodError)) {
      return new UnprocessableEntityException(error)
    }

    return new UnprocessableEntityException(
      error.issues.map((err) => {
        return {
          ...err,
          path: err.path.join('.'),
        }
      }),
    )
  },
})

export default CustomZodValidationPipe
