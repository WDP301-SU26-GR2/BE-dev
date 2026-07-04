import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'

export class SessionAlreadyExistsException extends ConflictException {
  constructor(title: string) {
    super(`Một phiên họp với tiêu đề "${title}" đang mở hoặc sắp diễn ra trong hệ thống.`)
  }
}

/**
 * 🌟 BỔ SUNG: Lỗi khi truy vấn một Phiên họp không tồn tại trong Database
 * Giúp giải quyết triệt để lỗi đỏ ts(2551) ở tầng Service
 */
export class SessionNotFoundException extends NotFoundException {
  constructor(sessionId?: string) {
    super(
      sessionId
        ? `Phiên họp hội đồng với mã định danh "${sessionId}" không tồn tại.`
        : 'Phiên họp hội đồng không tồn tại trên hệ thống.'
    )
  }
}

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
export class SessionNotOpenException extends BadRequestException {
  constructor(status: string) {
    super(
      `Không thể bỏ phiếu. Phiên họp này hiện đang ở trạng thái "${status}", chỉ chấp nhận biểu quyết khi trạng thái là "ACTIVE".`
    )
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

export class VoterNotAllowedException extends ForbiddenException {
  constructor() {
    super('Bạn không có tên trong danh sách đại biểu (allowedEditorIds) được mời tham gia phiên họp này.')
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

// Lỗi của API Config
export class ConfigLockedException extends BadRequestException {
  constructor() {
    super(
      'Không thể thay đổi điều lệ cấu hình do hiện đang có phiên họp Hội đồng đang mở (OPEN) và tiến hành biểu quyết.'
    )
  }
}

// Lỗi của API Report
export class SessionClosedReportException extends BadRequestException {
  constructor() {
    super('Không thể nộp hoặc đính kèm báo cáo vào một phiên họp đã bế mạc (CLOSED).')
  }
}

export class ReportNotFoundException extends NotFoundException {
  constructor(reportId?: string) {
    super(reportId ? `Báo cáo hội đồng với mã "${reportId}" không tồn tại.` : 'Báo cáo hội đồng không tồn tại.')
  }
}

export class EditorNotInvitedException extends ForbiddenException {
  constructor() {
    super('Bạn không thể nộp báo cáo cho cuộc họp này vì bạn không nằm trong danh sách thành viên được mời.')
  }
}
