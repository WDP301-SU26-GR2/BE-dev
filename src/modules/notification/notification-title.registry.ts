// Tiêu đề ngắn suy từ referenceType, không lưu vào DB và được tính khi map response.
// referenceType là mã máy đọc để FE deep-link; chỉ phần title được Việt hoá.
export const NOTIFICATION_TITLE_VI: Record<string, string> = {
  // Công việc
  TASK_ASSIGNED: 'Công việc mới',
  TASK_SUBMITTED: 'Có công việc chờ duyệt',
  TASK_APPROVED: 'Công việc được duyệt',
  TASK_REVISION_REQUESTED: 'Công việc cần chỉnh sửa',
  TASK_CANCELLED: 'Công việc bị huỷ',
  TASK_REASSIGNED: 'Công việc được giao lại',
  // Bản phác thảo và hồ sơ đề xuất
  STORYBOARD_APPROVED: 'Bản phác thảo được duyệt',
  STORYBOARD_RESUBMITTED: 'Bản phác thảo được nộp lại',
  STORYBOARD_REVISION_REQUESTED: 'Bản phác thảo cần chỉnh sửa',
  STORYBOARD_LOOP_WARNING: 'Bản phác thảo sửa quá nhiều vòng',
  PROPOSAL_APPROVED: 'Hồ sơ đề xuất được duyệt',
  PROPOSAL_REJECTED: 'Hồ sơ đề xuất bị từ chối',
  PROPOSAL_RESUBMITTED: 'Hồ sơ đề xuất được nộp lại',
  PROPOSAL_REVISION_REQUESTED: 'Hồ sơ đề xuất cần chỉnh sửa',
  // Bộ truyện
  SERIES_METADATA_UPDATED: 'Thông tin bộ truyện thay đổi',
  SERIES_REJECTED: 'Hội đồng từ chối bộ truyện',
  SERIES_REOPENED_FOR_REVIEW: 'Mở lại vòng chỉnh sửa',
  SERIES_WITHDRAWN_AFTER_REJECT: 'Tác giả rút hồ sơ',
  SERIES_WITHDRAWN_IN_REVIEW: 'Tác giả rút hồ sơ',
  SERIES_COMPLETION_PROPOSED: 'Đề xuất kết thúc bộ truyện',
  SERIES_REQUEST_CREATED: 'Yêu cầu mới từ tác giả',
  SERIES_REQUEST_ACCEPTED: 'Yêu cầu được chấp nhận',
  SERIES_REQUEST_REJECTED: 'Yêu cầu bị từ chối',
  SERIES_REQUEST_CANCELLED: 'Tác giả huỷ yêu cầu',
  SERIES_HIATUS_STARTED: 'Bộ truyện tạm ngưng',
  SERIES_RESUMED: 'Bộ truyện hoạt động lại',
  FRANCHISE_CONSENT_REQUESTED: 'Cần bạn đồng ý làm phái sinh',
  FRANCHISE_CONSENT_APPROVED: 'Đã đồng ý làm phái sinh',
  FRANCHISE_CONSENT_REJECTED: 'Đã từ chối làm phái sinh',
  // Chương và bản thảo
  CHAPTER_PUBLISHED: 'Chương đã xuất bản',
  CHAPTER_HELD: 'Chương tạm dừng sản xuất',
  CHAPTER_RESUMED: 'Chương tiếp tục sản xuất',
  MANUSCRIPT_SUBMITTED: 'Bản thảo chờ duyệt',
  MANUSCRIPT_APPROVED: 'Bản thảo được duyệt',
  MANUSCRIPT_RESUBMITTED: 'Bản thảo được nộp lại',
  MANUSCRIPT_REVISION_REQUESTED: 'Bản thảo cần chỉnh sửa',
  MANUSCRIPT_AWAITING_CO_OWNER: 'Chờ đồng sở hữu duyệt',
  CHAPTER_COOWNER_APPROVED: 'Đồng sở hữu đã duyệt',
  CHAPTER_COOWNER_REJECTED: 'Đồng sở hữu yêu cầu sửa',
  COOWNER_APPROVAL_ESCALATED: 'Duyệt quá hạn — đã chuyển Hội đồng',
  // Cộng tác và đánh giá
  INVITE_RECEIVED: 'Lời mời cộng tác',
  INVITE_ACCEPTED: 'Lời mời được chấp nhận',
  INVITE_DECLINED: 'Lời mời bị từ chối',
  ASSIGNMENT_TERMINATED: 'Hợp tác đã kết thúc',
  ASSISTANT_REVIEW_RECEIVED: 'Bạn nhận được đánh giá',
  MANGAKA_REVIEW_RECEIVED: 'Bạn nhận được đánh giá',
  REVISION_RESOLVED: 'Yêu cầu chỉnh sửa đã xong',
  // Hạn nộp
  DEADLINE_PROPOSED: 'Đề xuất đổi hạn nộp',
  DEADLINE_COUNTERED: 'Đề xuất hạn nộp đối ứng',
  DEADLINE_AGREED: 'Hai bên đã thống nhất hạn nộp',
  DEADLINE_REJECTED: 'Đề xuất hạn nộp bị từ chối',
  DEADLINE_WITHDRAWN: 'Yêu cầu đổi hạn nộp đã rút',
  DEADLINE_APPROVED: 'Hạn nộp mới đã được chốt',
  DEADLINE_BOARD_REVIEW: 'Hạn nộp chờ Hội đồng duyệt',
  DEADLINE_BOARD_APPROVED: 'Hội đồng duyệt hạn nộp',
  DEADLINE_BOARD_REJECTED: 'Hội đồng từ chối hạn nộp',
  // Hợp đồng
  CONTRACT_DRAFT_CREATED: 'Hợp đồng nháp đã tạo',
  CONTRACT_UPDATED: 'Hợp đồng được cập nhật',
  CONTRACT_REPRESENTATIVE_NEEDED: 'Cần đại diện Hội đồng ký',
  CONTRACT_REPRESENTATIVE_ASSIGNED: 'Bạn là đại diện ký hợp đồng',
  CONTRACT_REP_CLAIM_ESCALATED: 'Quá hạn chưa có đại diện ký',
  CONTRACT_AWAITING_MANGAKA: 'Hợp đồng chờ bạn ký',
  CONTRACT_FULLY_EXECUTED: 'Hợp đồng đã ký kết',
  CONTRACT_REJECTED_BY_MANGAKA: 'Tác giả từ chối hợp đồng',
  CONTRACT_AMENDMENT_NEEDED: 'Cần lập phụ lục hợp đồng',
  CONTRACT_AMENDED: 'Hợp đồng đã cập nhật qua phụ lục',
  AMENDMENT_CREATED: 'Phụ lục hợp đồng đã tạo',
  AMENDMENT_PENDING_SIGNATURES: 'Phụ lục chờ ký',
  AMENDMENT_REJECTED: 'Phụ lục bị từ chối',
  // Hội đồng, bình chọn và xếp hạng
  BOARD_SESSION_CREATED: 'Phiên họp Hội đồng mới',
  BOARD_SESSION_CONCLUDED: 'Phiên họp đã kết thúc',
  BOARD_DECISION_CREATED: 'Có quyết định cần bỏ phiếu',
  SURVEY_PERIOD_CREATED: 'Kỳ bình chọn mới',
  SURVEY_PERIOD_STATUS_UPDATED: 'Kỳ bình chọn đổi trạng thái',
  SURVEY_DATA_IMPORTED: 'Đã nhập phiếu bình chọn',
  SURVEY_RANKING_FINALIZED: 'Xếp hạng đã chốt',
  RANKING_AT_RISK: 'Bộ truyện vào vùng nguy cơ',
  RANKING_SEVERE_DIGEST: 'Danh sách nguy cơ nghiêm trọng',
  // Tái bản, chuyển nhượng và tài khoản
  REPRINT_REQUEST_CREATED: 'Yêu cầu tái bản mới',
  REPRINT_REQUEST_MANGAKA_APPROVED: 'Tác giả đồng ý tái bản',
  REPRINT_REQUEST_BOARD_APPROVED: 'Hội đồng duyệt tái bản',
  REPRINT_REQUEST_REJECTED: 'Yêu cầu tái bản bị từ chối',
  REPRINT_REQUEST_PUBLISHED: 'Bản tái bản đã phát hành',
  REPRINT_CHAPTER_SUBMITTED: 'Chương tái bản chờ duyệt',
  REPRINT_CHAPTER_REVIEWED: 'Chương tái bản đã duyệt',
  REPRINT_REVISION_ASSIGNED: 'Bạn được giao sửa bản tái bản',
  TRANSFER_REQUEST_APPROVED: 'Hội đồng thông qua chuyển nhượng',
  TRANSFER_REQUEST_REJECTED: 'Hội đồng từ chối chuyển nhượng',
  TRANSFER_CONTRACT_DRAFTED: 'Hợp đồng chuyển nhượng đã soạn',
  TRANSFER_CONTRACT_AWAITING_SIGNATURE: 'Đến lượt bạn ký',
  TRANSFER_REPLACEMENT_CONTRACT_DRAFTED: 'Hợp đồng thay thế đã soạn',
  TRANSFER_SETTLEMENT_COMPLETED: 'Chuyển nhượng hoàn tất',
  USER_BANNED: 'Tài khoản bị cấm',
  USER_BLOCKED: 'Tài khoản bị khoá',
  USER_REACTIVATED: 'Tài khoản được kích hoạt lại',
  TASK_AUTO_CANCELLED: 'Công việc bị tự huỷ do quá hạn'
}

// referenceType động dạng PREFIX:<biến>, khớp phần trước dấu hai chấm.
export const NOTIFICATION_TITLE_PREFIX_VI: Record<string, string> = {
  DEADLINE_WARNING: 'Sắp đến hạn nộp',
  TASK_DEADLINE_WARNING: 'Công việc sắp đến hạn',
  TASK_DEADLINE_OVERDUE: 'Công việc đã quá hạn',
  SERIES_HIATUS_TOO_LONG: 'Bộ truyện tạm ngưng quá lâu'
}

// Dự phòng theo NotificationType của Prisma.
export const NOTIFICATION_TITLE_BY_TYPE_VI: Record<string, string> = {
  SYSTEM: 'Thông báo hệ thống',
  CONTRACT: 'Hợp đồng',
  TASK: 'Công việc',
  DEADLINE: 'Hạn nộp',
  SURVEY: 'Bình chọn',
  BOARD: 'Hội đồng',
  REVIEW: 'Đánh giá'
}

const DEFAULT_TITLE = 'Thông báo'

/**
 * Resolve title by exact referenceType, dynamic prefix, NotificationType, then a generic default.
 * The result is always a non-empty string, including for legacy or unknown notifications.
 */
export function resolveNotificationTitle(referenceType: string | null, type: string | null): string {
  if (referenceType) {
    const exactTitle = NOTIFICATION_TITLE_VI[referenceType]
    if (exactTitle) return exactTitle

    const prefixTitle = NOTIFICATION_TITLE_PREFIX_VI[referenceType.split(':')[0]]
    if (prefixTitle) return prefixTitle
  }

  if (type) {
    const typeTitle = NOTIFICATION_TITLE_BY_TYPE_VI[type]
    if (typeTitle) return typeTitle
  }

  return DEFAULT_TITLE
}
