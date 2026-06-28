import { BadRequestException, NotFoundException } from '@nestjs/common'

/**
 * Lỗi khi hệ thống chưa có bất kỳ bản ghi cấu hình Hội đồng mặc định nào.
 */
export class BoardConfigNotFoundException extends NotFoundException {
  constructor() {
    super('Hệ thống chưa cấu hình cấu trúc tham số Hội đồng (BoardConfig) mặc định.')
  }
}

/**
 * Lỗi khi truy vấn một Quyết định họp không tồn tại trong Database.
 */
export class DecisionNotFoundException extends NotFoundException {
  constructor(decisionId?: string) {
    super(
      decisionId
        ? `Quyết định hội đồng với mã định danh "${decisionId}" không tồn tại.`
        : 'Quyết định hội đồng không tồn tại trên hệ thống.'
    )
  }
}

/**
 * Lỗi khi đại biểu cố tình bỏ phiếu vào cuộc họp đã đóng/chốt kết quả.
 */
export class DecisionFinalizedException extends BadRequestException {
  constructor() {
    super('Quyết định hội đồng này đã chốt kết quả biểu quyết trước đó, không thể nhận thêm phiếu.')
  }
}

/**
 * Lỗi kiểm tra chéo (khi không qua Gateway): Sĩ số tổng hội đồng bắt buộc phải là số lẻ.
 */
export class InvalidBoardMembersException extends BadRequestException {
  constructor() {
    super('Sĩ số tổng của thành viên Hội đồng bắt buộc phải là số lẻ để loại trừ tình trạng hòa phiếu.')
  }
}

/**
 * Lỗi cấu hình: Sĩ số họp tối thiểu vượt quá tổng số đại biểu hiện có.
 */
export class InvalidQuorumException extends BadRequestException {
  constructor() {
    super('Số lượng thành viên tối thiểu tham gia họp (Quorum) không được phép vượt quá tổng sĩ số đại biểu.')
  }
}

/**
 * Lỗi chặn đại biểu bỏ phiếu trùng lặp nhiều lần trong cùng một phiên họp.
 */
export class VoterAlreadyVotedException extends BadRequestException {
  constructor(voterId: string) {
    super(`Đại biểu ứng với mã "${voterId}" đã thực hiện quyền biểu quyết trước đó trong quyết định này.`)
  }
}
