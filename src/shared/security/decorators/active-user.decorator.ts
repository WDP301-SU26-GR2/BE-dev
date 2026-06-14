import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { REQUEST_USER_KEY } from '../auth-type'
import { JwtAccessTokenPayload } from '../jwt.type'

// createParamDecorator dùng để tạo các params decorator tùy chỉnh, cho
// phép bạn trích xuất và xử lý dữ liệu từ request một cách dễ dàng và
// linh hoạt hơn trong các route handler của NestJS. Trong trường hợp này,
//  ActiveUser decorator sẽ trích xuất thông tin người dùng đã được xác
// thực từ request và trả về giá trị tương ứng dựa trên field được chỉ định khi sử dụng decorator này trong route handler.
export const ActiveUser = createParamDecorator(
  (field: keyof JwtAccessTokenPayload | undefined, context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest()
    const user: JwtAccessTokenPayload | undefined = req[REQUEST_USER_KEY]
    return field ? user?.[field] : user
  }
)
