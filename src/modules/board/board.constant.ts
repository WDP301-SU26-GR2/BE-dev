import { $Enums, SeriesStatus } from '@prisma/client'

/**
 * Các hằng số cấu hình hệ thống mặc định cho Hội đồng ban trị sự
 * nếu trong Database chưa khởi tạo bản ghi cấu hình nào.
 */
export const BOARD_DEFAULT_CONFIG = {
  TOTAL_MEMBERS: 17, // Sĩ số tổng bắt buộc phải là số lẻ
  QUORUM_MIN: 3, // Sĩ số tối thiểu để cuộc họp hợp lệ
  APPROVE_MAJORITY_RATIO: 0.51 // Tỷ lệ đồng thuận đạt trên 51%
}

export const BOARD_ROSTER_MIN = 3
export const BOARD_ROSTER_HARD_MAX = 18

/**
 * Trần sĩ số roster của một phiên họp = min(cấu hình boardTotalMembers, trần cứng 9), ép về số lẻ (làm tròn xuống).
 * Dùng CHUNG cho cả nhánh auto-assign (BoardRosterService) và nhánh manual (BoardSessionWorkflowService.createSession)
 * để hai đường tạo phiên có cùng một giới hạn max — tránh nhánh manual không có trần.
 */
export function computeRosterCap(boardTotalMembers: number): number {
  const bounded = Math.min(boardTotalMembers, BOARD_ROSTER_HARD_MAX)
  return bounded % 2 === 0 ? bounded - 1 : bounded
}

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
 * Loại quyết định chỉ hợp lệ với một số trạng thái bộ truyện.
 * Loại KHÔNG có trong bảng (REPRINT/TRANSFER/CONTRACT/SERIES_CONTRACT_APPROVAL) do module khác sở hữu vòng đời ⇒ không kiểm.
 */
export const DECISION_TYPE_ALLOWED_SERIES_STATUSES: Partial<Record<$Enums.DecisionType, SeriesStatus[]>> = {
  [$Enums.DecisionType.SERIALIZATION]: [SeriesStatus.PITCHED],
  [$Enums.DecisionType.CANCELLATION]: [SeriesStatus.SERIALIZED, SeriesStatus.HIATUS],
  [$Enums.DecisionType.COMPLETION]: [SeriesStatus.SERIALIZED, SeriesStatus.HIATUS],
  [$Enums.DecisionType.FORMAT_CHANGE]: [SeriesStatus.SERIALIZED, SeriesStatus.HIATUS]
}

/**
 * Tên các sự kiện (Event Bus) được phát ra toàn hệ thống
 * khi trạng thái cuộc họp hoặc quyết định thay đổi.
 */
export const BOARD_EVENTS = {
  DECISION_CREATED: 'board.decision.created',
  DECISION_CONCLUDED: 'board.decision.concluded'
}
