import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'

export const ContractErrors = {
  // Lỗi khi tìm kiếm một hợp đồng không tồn tại trong DB
  NotFound: () => new NotFoundException('CONTRACT_NOT_FOUND'),

  // B-CON-01: chỉ được tạo hợp đồng sau khi series đã được Board serial hoá (SERIALIZED)
  SeriesNotSerialized: () => new ConflictException([{ message: 'Error.SeriesNotSerialized', path: 'seriesId' }]),

  // Lỗi khi Editor này cố tình sửa hợp đồng của Editor khác phụ trách
  UnauthorizedEditor: () => new ForbiddenException('ONLY_ASSIGNED_EDITOR_CAN_EDIT'),

  // Lỗi khi trạng thái hợp đồng không hợp lệ cho hành động hiện tại (ví dụ: đang DRAFT mà đòi ký)
  InvalidStatus: () => new BadRequestException('INVALID_CONTRACT_STATUS_FOR_THIS_ACTION'),

  AlreadySigned: () => new BadRequestException('CONTRACT_ALREADY_SIGNED_BY_THIS_PARTY'),

  BoardDecisionNotFound: () =>
    new BadRequestException(
      'BOARD_DECISION_NOT_FOUND',
      'Hợp đồng này chưa có quyết định phê duyệt chính thức từ Hội đồng'
    ),

  NotAuthorizedInBoard: () =>
    new ForbiddenException(
      'NOT_AUTHORIZED_IN_BOARD',
      'Tài khoản của bạn không thuộc Hội đồng Ban giám đốc được chỉ định ký kết hợp đồng này'
    ),

  BoardMemberAlreadySigned: () =>
    new BadRequestException('BOARD_MEMBER_ALREADY_SIGNED', 'Bạn đã thực hiện xác thực ký vào hợp đồng này trước đó rồi')
}
