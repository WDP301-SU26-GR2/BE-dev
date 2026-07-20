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
    // Lý do bắt buộc (B-CON-02): Editor phải biết SỬA GÌ, không chỉ biết "có người đòi sửa".
    mangakaRequestedChanges: (reason: string) => `Mangaka yêu cầu chỉnh sửa điều khoản hợp đồng. Lý do: ${reason}`,
    boardApproved: 'Hội đồng đã duyệt điều khoản — sẵn sàng ký.',
    boardRequestedChanges: (reason: string) =>
      `Hội đồng yêu cầu chỉnh sửa điều khoản — cần gửi lại Mangaka duyệt. Lý do: ${reason}`,
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
    contractAccessDenied: 'Error.ContractAccessDenied',
    boardDecisionNotFound: 'Error.BoardDecisionNotFound',
    invalidSerializationDecision: 'Error.InvalidSerializationDecision',
    contractMangakaMismatch: 'Error.ContractMangakaMismatch',
    openContractExists: 'Error.OpenContractExists',
    contractNotExecutedForPdf: 'Error.ContractNotExecutedForPdf',
    // Chuẩn hoá 2026-07-20: 9 mã dưới đây trước kia là raw-string SCREAMING_SNAKE khai thẳng trong
    // errors/contract.errors.ts (lệch AGENTS §7 — errors file phải lấy text từ catalog).
    contractNotFound: 'Error.ContractNotFound',
    revenueNotApplicable: 'Error.RevenueNotApplicable',
    notAssignedContractEditor: 'Error.NotAssignedContractEditor',
    invalidContractStatus: 'Error.InvalidContractStatus',
    contractAlreadySigned: 'Error.ContractAlreadySigned',
    // Khác `boardDecisionNotFound` ở trên: mã này dùng khi hợp đồng ĐANG KÝ mà thiếu quyết định Board,
    // còn `Error.BoardDecisionNotFound` dùng ở gate TẠO hợp đồng.
    contractBoardDecisionMissing: 'Error.ContractBoardDecisionMissing',
    notAuthorizedInBoard: 'Error.NotAuthorizedInBoard',
    boardMemberAlreadySigned: 'Error.BoardMemberAlreadySigned',
    mangakaSignNotRequired: 'Error.MangakaSignNotRequired'
  },
  errorText: {
    'Error.BoardDecisionNotFound': 'Không tìm thấy quyết định Hội đồng',
    'Error.InvalidSerializationDecision': 'Quyết định Hội đồng không hợp lệ để tạo hợp đồng serial hóa',
    'Error.ContractMangakaMismatch': 'Mangaka trong hợp đồng không phải chủ sở hữu Series',
    'Error.OpenContractExists': 'Series hoặc quyết định này đã có hợp đồng chưa kết thúc',
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
    'Error.ContractNotFound': 'Không tìm thấy hợp đồng',
    'Error.RevenueNotApplicable': 'Hợp đồng này không áp dụng chia doanh thu',
    'Error.NotAssignedContractEditor': 'Chỉ Editor phụ trách mới được chỉnh sửa hợp đồng',
    'Error.InvalidContractStatus': 'Trạng thái hợp đồng không phù hợp với thao tác này',
    'Error.ContractAlreadySigned': 'Bên này đã ký hợp đồng',
    'Error.ContractBoardDecisionMissing': 'Không tìm thấy quyết định Hội đồng của hợp đồng',
    'Error.NotAuthorizedInBoard': 'Bạn không thuộc Hội đồng được chỉ định cho hợp đồng này',
    'Error.BoardMemberAlreadySigned': 'Bạn đã ký hợp đồng này',
    'Error.MangakaSignNotRequired': 'Hợp đồng này không yêu cầu chữ ký của Mangaka',
    'Error.ContractNotExecutedForPdf': 'Hợp đồng chưa ký khoá — chỉ xuất PDF từ khi FULLY_EXECUTED'
  }
} as const
