export const DeadlineMessages = {
  notification: {
    proposed: 'Có đề xuất thay đổi hạn nộp',
    counterProposed: 'Có đề xuất hạn nộp đối ứng',
    agreed: 'Đề xuất hạn nộp đã được đồng ý',
    rejected: 'Đề xuất hạn nộp bị từ chối và đã chuyển lên Hội đồng',
    withdrawn: 'Yêu cầu thay đổi hạn nộp đã được rút',
    approved: 'Thay đổi hạn nộp đã được duyệt — lịch đã cập nhật',
    boardReview: 'Thay đổi hạn nộp đã được gửi Hội đồng duyệt vì ảnh hưởng lịch xuất bản',
    boardApproved: 'Hội đồng đã duyệt thay đổi hạn nộp',
    boardRejected: 'Hội đồng đã từ chối thay đổi hạn nộp'
  },
  error: {
    notFound: 'Error.DeadlineRequestNotFound',
    accessDenied: 'Error.DeadlineRequestAccessDenied',
    notCounterparty: 'Error.NotCounterparty',
    openExists: 'Error.OpenDeadlineRequestExists',
    notAllowed: 'Error.DeadlineRequestNotAllowed',
    invalidTransition: 'Error.InvalidDeadlineRequestTransition',
    deadlineNotAwaitingBoard: 'Error.DeadlineNotAwaitingBoard'
  },
  errorText: {
    'Error.DeadlineRequestNotFound': 'Không tìm thấy yêu cầu thay đổi hạn nộp',
    'Error.DeadlineRequestAccessDenied': 'Bạn không có quyền truy cập yêu cầu hạn nộp này',
    'Error.NotCounterparty': 'Bạn không phải bên đối ứng của yêu cầu hạn nộp này',
    'Error.OpenDeadlineRequestExists': 'Chương này đã có yêu cầu hạn nộp đang xử lý',
    'Error.DeadlineRequestNotAllowed': 'Hiện không thể tạo yêu cầu thay đổi hạn nộp',
    'Error.InvalidDeadlineRequestTransition': 'Không thể chuyển yêu cầu hạn nộp sang trạng thái này',
    'Error.DeadlineNotAwaitingBoard': 'Yêu cầu hạn nộp không ở trạng thái chờ Hội đồng duyệt'
  }
} as const
