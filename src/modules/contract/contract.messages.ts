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
    // Content thông báo gửi tới editor / mangaka / board — là function để chèn dynamic data.
    boardApproved: () => 'Hội đồng đã duyệt điều khoản — sẵn sàng ký.',
    boardRequestedChanges: () => 'Hội đồng yêu cầu chỉnh sửa điều khoản — cần gửi lại Mangaka duyệt.',
    mangakaRequestedChanges: () => 'Mangaka yêu cầu chỉnh sửa điều khoản hợp đồng.'
  },
  error: {
    // Error.* code (FE map sang text hiển thị). KHÔNG hard-code chuỗi hiển thị ở service.
    invalidContractTransition: 'Error.InvalidContractTransition',
    contractNotSignableYet: 'Error.ContractNotSignableYet'
  }
} as const
