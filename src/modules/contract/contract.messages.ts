// Contract module message catalog (Spec 6 / B-CON-02).
// Theo AGENTS §7: mọi text user-facing sống ở <name>.messages.ts (string thuần, KHÔNG NestJS, KHÔNG logic).

export const ContractMessages = {
  response: {
    // Có sẵn ở contract.service — giữ tập trung tại đây cho dễ i18n sau này.
    contractDraftCreated: 'Contract draft created',
    contractSentToMangaka: 'Contract sent to mangaka for review',
    contractMangakaApproved: 'Mangaka đã đồng ý các điều khoản hợp đồng.',
    contractBoardApproved: 'Hội đồng đã duyệt điều khoản — sẵn sàng ký.',
    contractMangakaRequestedChanges: 'Mangaka yêu cầu chỉnh sửa điều khoản hợp đồng.',
    contractBoardRequestedChanges: 'Hội đồng yêu cầu chỉnh sửa điều khoản — cần gửi lại Mangaka duyệt.'
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
  }
} as const
