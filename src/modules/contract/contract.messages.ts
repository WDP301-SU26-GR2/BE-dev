// Contract module message catalog (Spec 6 / B-CON-02).
// Theo AGENTS §7: mọi text user-facing sống ở <name>.messages.ts (string thuần, KHÔNG NestJS, KHÔNG logic).

export const ContractMessages = {
  response: {
    // Có sẵn ở contract.service — giữ tập trung tại đây cho dễ i18n sau này.
    contractDraftCreated: 'Đã tạo bản nháp hợp đồng',
    contractSentToMangaka: 'Đã gửi hợp đồng cho Mangaka xem xét',
    contractMangakaApproved: 'Mangaka đã đồng ý các điều khoản hợp đồng.',
    contractBoardApproved: 'Hội đồng đã duyệt điều khoản — sẵn sàng ký.',
    contractMangakaRequestedChanges: 'Mangaka yêu cầu chỉnh sửa điều khoản hợp đồng.',
    contractBoardRequestedChanges: 'Hội đồng yêu cầu chỉnh sửa điều khoản — cần gửi lại Mangaka duyệt.',
    boardSignaturesCompleted: 'Toàn bộ thành viên Hội đồng đã ký hợp đồng',
    boardSignatureRecorded: (signed: number, required: number) =>
      `Đã ghi nhận chữ ký. Đang chờ các thành viên Hội đồng còn lại (${signed}/${required})`,
    revenueRecorded: 'Đã ghi nhận doanh thu, hệ thống đang chia theo hợp đồng.'
  },
  notification: {
    // Content thông báo gửi tới editor / mangaka / board — string thuần, không có tham số động.
    contractDraftCreatedEditor: 'Bản hợp đồng nháp đã được tạo thành công.',
    contractDraftCreatedMangaka: 'Một hợp đồng mới đã được tạo cho bạn và đang chờ xem xét.',
    contractSentToMangaka: 'Hợp đồng đã được gửi cho bạn để xem xét và ký kết.',
    contractUpdated: 'Hợp đồng đã được editor cập nhật và cần bạn xem xét lại.',
    contractMangakaApproved: 'Mangaka đã đồng ý các điều khoản hợp đồng.',
    mangakaRequestedChanges: 'Mangaka yêu cầu chỉnh sửa điều khoản hợp đồng.',
    boardApproved: 'Hội đồng đã duyệt điều khoản — sẵn sàng ký.',
    boardRequestedChanges: 'Hội đồng yêu cầu chỉnh sửa điều khoản — cần gửi lại Mangaka duyệt.',
    contractFullyExecutedMangaka: 'Hợp đồng đã được ký kết hoàn tất.',
    contractFullyExecutedEditor: 'Hợp đồng đã được ký kết hoàn tất.',
    amendmentCreated: 'Một phụ lục hợp đồng đang được soạn — vui lòng theo dõi.',
    amendmentPendingSignatures: 'Phụ lục hợp đồng đã sẵn sàng để ký.',
    contractAmended: 'Điều khoản hợp đồng đã được cập nhật qua phụ lục.',
    amendmentRejected: 'Mangaka đã từ chối phụ lục — vui lòng chỉnh sửa điều khoản.',
    amendmentNeeded: 'Series cần phụ lục hợp đồng — vui lòng nhập điều khoản và trình ký.'
  },
  error: {
    // Error.* code (FE map sang text hiển thị). KHÔNG hard-code chuỗi hiển thị ở service.
    invalidContractTransition: 'Error.InvalidContractTransition',
    contractNotSignableYet: 'Error.ContractNotSignableYet',
    notContractMangaka: 'Error.NotContractMangaka',
    contractAccessDenied: 'Error.ContractAccessDenied'
  },
  errorText: {
    'Error.InvalidContractTransition': 'Không thể chuyển hợp đồng sang trạng thái này',
    'Error.ContractNotSignableYet': 'Hợp đồng chưa sẵn sàng để ký',
    'Error.NotContractMangaka': 'Bạn không phải Mangaka của hợp đồng này',
    'Error.ContractAccessDenied': 'Bạn không có quyền truy cập hợp đồng này',
    'Error.SeriesNotSerialized': 'Series chưa được duyệt để phát hành dài kỳ',
    'Error.ContractNotAmendable': 'Hợp đồng hiện không thể tạo phụ lục',
    'Error.OpenAmendmentExists': 'Hợp đồng đã có một phụ lục chưa hoàn tất',
    'Error.AmendmentNotFound': 'Không tìm thấy phụ lục hợp đồng',
    'Error.AmendmentNotEditable': 'Phụ lục hiện không thể chỉnh sửa',
    'Error.AmendmentNotSubmittable': 'Phụ lục hiện chưa thể gửi ký',
    'Error.AmendmentNoChanges': 'Phụ lục chưa có nội dung thay đổi',
    'Error.AmendmentNotPendingSignatures': 'Phụ lục không ở trạng thái chờ ký',
    'Error.AmendmentNotVoidable': 'Phụ lục hiện không thể hủy',
    'Error.OwnershipMismatch': 'Tỷ lệ sở hữu trong phụ lục không hợp lệ',
    CONTRACT_NOT_FOUND: 'Không tìm thấy hợp đồng',
    REVENUE_NOT_APPLICABLE: 'Hợp đồng này không áp dụng chia doanh thu',
    ONLY_ASSIGNED_EDITOR_CAN_EDIT: 'Chỉ Editor phụ trách mới được chỉnh sửa hợp đồng',
    INVALID_CONTRACT_STATUS_FOR_THIS_ACTION: 'Trạng thái hợp đồng không phù hợp với thao tác này',
    CONTRACT_ALREADY_SIGNED_BY_THIS_PARTY: 'Bên này đã ký hợp đồng',
    BOARD_DECISION_NOT_FOUND: 'Không tìm thấy quyết định Hội đồng của hợp đồng',
    NOT_AUTHORIZED_IN_BOARD: 'Bạn không thuộc Hội đồng được chỉ định cho hợp đồng này',
    BOARD_MEMBER_ALREADY_SIGNED: 'Bạn đã ký hợp đồng này',
    MangakaSignNotRequired: 'Hợp đồng này không yêu cầu chữ ký của Mangaka',
    'Error.MangakaSignNotRequired': 'Hợp đồng này không yêu cầu chữ ký của Mangaka'
  }
} as const
