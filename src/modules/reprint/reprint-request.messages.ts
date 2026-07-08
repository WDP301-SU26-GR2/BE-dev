// Reprint module message catalog (Spec 9 / B-RPT-* + PB-07).
// Theo AGENTS §7: mọi text user-facing sống ở <name>.messages.ts (string thuần, KHÔNG NestJS, KHÔNG logic).

export const ReprintRequestMessages = {
  // Notification content — service chèn key này vào notifySafe.content.
  // Plain string là đủ vì context đã được service xác định trước.
  notification: {
    created: 'Yêu cầu tái bản đã được tạo và đang chờ xử lý.',
    createdForMangaka: 'Có yêu cầu tái bản mới cần bạn xem xét.',
    mangakaApproved: 'Mangaka đã đồng ý yêu cầu tái bản.',
    mangakaRejected: 'Yêu cầu tái bản đã bị từ chối.',
    boardApproved: 'Yêu cầu tái bản đã được Hội đồng phê duyệt.',
    boardRejected: 'Yêu cầu tái bản đã bị Hội đồng từ chối.',
    chapterSubmitted: 'Mangaka đã nộp bản thảo cho chương tái bản.',
    chapterReviewed: 'Chương tái bản đã được duyệt/review và đang chờ hoàn tất luồng.',
    published: 'Tất cả chương tái bản đã được phê duyệt và công bố.',
    reviserAssigned: 'Bạn được giao sửa bản tái bản.'
  },
  // Audit reason text (English-only for log scannability; user-facing copy lives in `notification`).
  reason: {
    reviserAssigned: (reviserType: string, reviserId: string, chapterId: string) =>
      `${reviserType}:${reviserId} → chapter ${chapterId}`
  },
  // Error.* code (FE map sang text hiển thị). KHÔNG hard-code chuỗi hiển thị ở service.
  error: {
    reprintRequestNotFound: 'Error.ReprintRequestNotFound',
    activeContractNotFound: 'Error.ActiveContractNotFound',
    originalChaptersNotFound: 'Error.OriginalChaptersNotFound',
    reprintChapterNotFound: 'Error.ReprintChapterNotFound',
    invalidReprintTransition: 'Error.InvalidReprintTransition',
    reprintActionNotAllowed: 'Error.ReprintActionNotAllowed',
    reprintNotWithRevision: 'Error.ReprintNotWithRevision',
    reviserOnlyForFullBuyout: 'Error.ReviserOnlyForFullBuyout',
    reviserMangakaNotFound: 'Error.ReviserMangakaNotFound'
  }
} as const
