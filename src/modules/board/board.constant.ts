/**
 * Enum đại diện cho các giá trị bỏ phiếu của thành viên Hội đồng.
 * Đồng bộ chính xác với tập hợp giá trị trong CastVoteBodySchema.
 */
export enum VoteValue {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  ABSTAIN = 'ABSTAIN'
}

/**
 * Các hằng số cấu hình hệ thống mặc định cho Hội đồng ban trị sự
 * nếu trong Database chưa khởi tạo bản ghi cấu hình nào.
 */
export const BOARD_DEFAULT_CONFIG = {
  TOTAL_MEMBERS: 5, // Sĩ số tổng bắt buộc phải là số lẻ
  QUORUM_MIN: 3, // Sĩ số tối thiểu để cuộc họp hợp lệ
  APPROVE_MAJORITY_RATIO: 0.51 // Tỷ lệ đồng thuận đạt trên 51%
}

/**
 * Tên các sự kiện (Event Bus) được phát ra toàn hệ thống
 * khi trạng thái cuộc họp hoặc quyết định thay đổi.
 */
export const BOARD_EVENTS = {
  DECISION_CREATED: 'board.decision.created',
  DECISION_CONCLUDED: 'board.decision.concluded'
}
