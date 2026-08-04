// Catalog text tiếng Việt cho module series-request — nguồn sự thật duy nhất.
// Chỉ chuỗi thuần, KHÔNG import NestJS, KHÔNG logic (AGENTS §7).
export const SeriesRequestMessages = {
  response: {
    created: 'Đã gửi yêu cầu tới biên tập viên',
    accepted: 'Đã chấp nhận yêu cầu',
    rejected: 'Đã từ chối yêu cầu',
    cancelled: 'Đã huỷ yêu cầu'
  },
  notification: {
    createdWithdraw: (reason: string) => `Tác giả xin rút hồ sơ bộ truyện. Lý do: ${reason}`,
    createdHiatus: (reason: string) => `Tác giả xin tạm ngưng bộ truyện. Lý do: ${reason}`,
    createdCompletion: (reason: string) => `Tác giả xin kết thúc sớm bộ truyện. Lý do: ${reason}`,
    acceptedWithdraw: 'Biên tập viên đã đồng ý cho rút hồ sơ bộ truyện',
    acceptedHiatus: 'Biên tập viên đã đồng ý cho bộ truyện tạm ngưng',
    acceptedCompletion: 'Biên tập viên đã đồng ý và sẽ trình Hội đồng xem xét kết thúc bộ truyện',
    rejected: (reason: string) => `Biên tập viên đã từ chối yêu cầu của bạn. Lý do: ${reason}`,
    cancelled: 'Tác giả đã huỷ yêu cầu'
  },
  error: {
    notFound: 'Error.SeriesRequestNotFound',
    notAllowed: 'Error.SeriesRequestNotAllowed',
    openExists: 'Error.OpenSeriesRequestExists',
    invalidTransition: 'Error.InvalidSeriesRequestTransition',
    accessDenied: 'Error.SeriesRequestAccessDenied'
  },
  errorText: {
    'Error.SeriesRequestNotFound': 'Không tìm thấy yêu cầu',
    'Error.SeriesRequestNotAllowed': 'Bộ truyện đang ở trạng thái không cho phép gửi yêu cầu này',
    'Error.OpenSeriesRequestExists': 'Bộ truyện đã có một yêu cầu đang chờ xử lý',
    'Error.InvalidSeriesRequestTransition': 'Yêu cầu này đã được xử lý trước đó',
    'Error.SeriesRequestAccessDenied': 'Bạn không có quyền với yêu cầu này'
  }
} as const
