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
  },
  errorText: {
    'Error.ReprintRequestNotFound': 'Không tìm thấy yêu cầu tái bản',
    'Error.ActiveContractNotFound': 'Không tìm thấy hợp đồng đang có hiệu lực cho series',
    'Error.OriginalChaptersNotFound': 'Không tìm thấy các chương gốc cần tái bản',
    'Error.ReprintChapterNotFound': 'Không tìm thấy chương tái bản',
    'Error.InvalidReprintTransition': 'Không thể chuyển yêu cầu tái bản sang trạng thái này',
    'Error.ReprintActionNotAllowed': 'Bạn không được phép thực hiện thao tác tái bản này',
    'Error.ReprintNotWithRevision': 'Yêu cầu tái bản này không bao gồm chỉnh sửa nội dung',
    'Error.ReviserOnlyForFullBuyout': 'Chỉ hợp đồng mua đứt mới được chỉ định người chỉnh sửa',
    'Error.ReviserMangakaNotFound': 'Không tìm thấy Mangaka được chỉ định chỉnh sửa'
  }
} as const
