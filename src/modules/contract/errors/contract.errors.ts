import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'

export const ContractErrors = {
  // Lỗi khi tìm kiếm một hợp đồng không tồn tại trong DB
  NotFound: () => new NotFoundException('CONTRACT_NOT_FOUND'),

  // Lỗi khi Editor này cố tình sửa hợp đồng của Editor khác phụ trách
  UnauthorizedEditor: () => new ForbiddenException('ONLY_ASSIGNED_EDITOR_CAN_EDIT'),

  // Lỗi khi trạng thái hợp đồng không hợp lệ cho hành động hiện tại (ví dụ: đang DRAFT mà đòi ký)
  InvalidStatus: () => new BadRequestException('INVALID_CONTRACT_STATUS_FOR_THIS_ACTION'),

  // Lỗi khi một bên cố tình ký lại lần nữa khi họ đã ký rồi
  AlreadySigned: () => new BadRequestException('CONTRACT_ALREADY_SIGNED_BY_THIS_PARTY')
}
