export const AiMessages = {
  response: {
    segmentQueued: 'Tác vụ phân vùng AI đã được đưa vào hàng đợi',
    applied: 'Đã áp dụng các vùng AI vào trang'
  },
  error: {
    aiNotEnabled: 'Error.AiNotEnabled',
    aiEnqueueFailed: 'Error.AiEnqueueFailed',
    pageHasNoFile: 'Error.PageHasNoFile',
    segmentJobAlreadyRunning: 'Error.SegmentJobAlreadyRunning',
    aiJobNotFound: 'Error.AiJobNotFound',
    aiJobNotApplicable: 'Error.AiJobNotApplicable'
  },
  errorText: {
    'Error.AiNotEnabled': 'Tính năng AI hiện chưa được bật',
    'Error.AiEnqueueFailed': 'Không thể tạo tác vụ AI — vui lòng thử lại',
    'Error.PageHasNoFile': 'Trang chưa có tệp để xử lý bằng AI',
    'Error.SegmentJobAlreadyRunning': 'Trang này đang có một tác vụ phân vùng AI chạy',
    'Error.AiJobNotFound': 'Không tìm thấy tác vụ AI',
    'Error.AiJobNotApplicable': 'Tác vụ AI này không thể áp dụng ở trạng thái hiện tại'
  }
} as const
