import { $Enums } from '@prisma/client'

/**
 * Các hằng số cấu hình hệ thống mặc định cho Hội đồng ban trị sự
 * nếu trong Database chưa khởi tạo bản ghi cấu hình nào.
 */
export const BOARD_DEFAULT_CONFIG = {
  TOTAL_MEMBERS: 5, // Sĩ số tổng bắt buộc phải là số lẻ
  QUORUM_MIN: 3, // Sĩ số tối thiểu để cuộc họp hợp lệ
  APPROVE_MAJORITY_RATIO: 0.51 // Tỷ lệ đồng thuận đạt trên 51%
}

export const BOARD_ROSTER_HARD_MAX = 9

/**
 * Các kết quả CHỐT của một quyết định — đã vào một trong ba trạng thái này thì không được ghi đè.
 * Dùng làm điều kiện cho lệnh ghi khi chốt phiếu: hai phiếu cuối về đồng thời thì chỉ MỘT request
 * giành được quyền chốt, nhờ đó `BoardDecisionFinalized` chỉ phát đúng một lần (O-2).
 */
export const TERMINAL_DECISION_RESULTS = [
  $Enums.BoardDecisionResult.APPROVED,
  $Enums.BoardDecisionResult.REJECTED,
  $Enums.BoardDecisionResult.EXPIRED
]

/**
 * Tên các sự kiện (Event Bus) được phát ra toàn hệ thống
 * khi trạng thái cuộc họp hoặc quyết định thay đổi.
 */
export const BOARD_EVENTS = {
  DECISION_CREATED: 'board.decision.created',
  DECISION_CONCLUDED: 'board.decision.concluded'
}
