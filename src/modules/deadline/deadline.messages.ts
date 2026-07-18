export const DeadlineMessages = {
  notification: {
    proposed: 'Có đề xuất thay đổi deadline',
    counterProposed: 'Có đề xuất deadline đối ứng',
    agreed: 'Đề xuất deadline đã được đồng ý',
    rejected: 'Đề xuất deadline bị từ chối và đã chuyển lên Hội đồng',
    withdrawn: 'Yêu cầu thay đổi deadline đã được rút',
    approved: 'Thay đổi deadline đã được duyệt — lịch đã cập nhật',
    boardReview: 'Thay đổi deadline đã được gửi Hội đồng duyệt vì ảnh hưởng lịch xuất bản',
    boardApproved: 'Hội đồng đã duyệt thay đổi deadline',
    boardRejected: 'Hội đồng đã từ chối thay đổi deadline'
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
    'Error.DeadlineRequestNotFound': 'Không tìm thấy yêu cầu thay đổi deadline',
    'Error.DeadlineRequestAccessDenied': 'Bạn không có quyền truy cập yêu cầu deadline này',
    'Error.NotCounterparty': 'Bạn không phải bên đối ứng của yêu cầu deadline này',
    'Error.OpenDeadlineRequestExists': 'Chương này đã có yêu cầu deadline đang xử lý',
    'Error.DeadlineRequestNotAllowed': 'Hiện không thể tạo yêu cầu thay đổi deadline',
    'Error.InvalidDeadlineRequestTransition': 'Không thể chuyển yêu cầu deadline sang trạng thái này',
    'Error.DeadlineNotAwaitingBoard': 'Yêu cầu deadline không ở trạng thái chờ Hội đồng duyệt'
  }
} as const
