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
    aiJobNotApplicable: 'Error.AiJobNotApplicable',
    aiJobSourceStale: 'Error.AiJobSourceStale',
    aiSourceCanvasMismatch: 'Error.AiSourceCanvasMismatch'
  },
  errorText: {
    'Error.AiNotEnabled': 'Tính năng AI hiện chưa được bật',
    'Error.AiEnqueueFailed': 'Không thể tạo tác vụ AI — vui lòng thử lại',
    'Error.PageHasNoFile': 'Trang chưa có tệp để xử lý bằng AI',
    'Error.SegmentJobAlreadyRunning': 'Trang này đang có một tác vụ phân vùng AI chạy',
    'Error.AiJobNotFound': 'Không tìm thấy tác vụ AI',
    'Error.AiJobNotApplicable': 'Tác vụ AI này không thể áp dụng ở trạng thái hiện tại',
    'Error.AiJobSourceStale': 'Nguồn của tác vụ AI không còn khớp với giai đoạn hiện tại',
    'Error.AiSourceCanvasMismatch': 'Kích thước ảnh nguồn AI không khớp với canvas của trang'
  }
} as const
