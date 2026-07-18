export const SurveyMessages = {
  response: {
    otpSent: 'OTP bình chọn đã được gửi thành công.',
    voteSubmitted: 'Bình chọn của bạn đã được ghi nhận.',
    otpAlreadySent: 'OTP hiện có vẫn còn hiệu lực. Vui lòng kiểm tra lại tin nhắn của bạn.',
    surveyPeriodCreated: 'Kỳ bình chọn mới đã được tạo.',
    surveyPeriodStatusUpdated: 'Trạng thái kỳ bình chọn đã được cập nhật.',
    surveyDataImported: 'Dữ liệu bình chọn đã được nhập.',
    rankingFinalized: 'Xếp hạng kỳ bình chọn đã được tính toán.',
    votingConfigUpdated: 'Cấu hình bình chọn đã được lưu.'
  },
  notification: {
    rankingAtRisk: 'Series của bạn đang ở vùng nguy cơ theo kết quả bình chọn kỳ này.',
    rankingSevereDigest: (n: number) => `Có ${n} series ở mức nguy cơ nghiêm trọng (SEVERE) cần Hội đồng xem xét.`,
    rankingFinalized: 'Kết quả xếp hạng kỳ bình chọn đã được tính toán.',
    // Spec 11 §1.3 — text giữ nguyên 1:1 từ hard-code trong service
    surveyPeriodCreated: 'Kỳ bình chọn mới đã được tạo thành công.',
    surveyPeriodStatusUpdated: 'Trạng thái kỳ bình chọn đã được cập nhật.',
    surveyDataImported: 'Dữ liệu bình chọn offline đã được nhập thành công.'
  },
  error: {
    surveyPeriodNotFound: 'Error.SurveyPeriodNotFound',
    surveyPeriodNotOpen: 'Error.SurveyPeriodNotOpen',
    surveyPeriodAlreadyFinalized: 'Error.SurveyPeriodAlreadyFinalized',
    surveyPeriodNotFinalized: 'Error.SurveyPeriodNotFinalized',
    readerAlreadyVoted: 'Error.ReaderAlreadyVoted',
    voteOtpNotFound: 'Error.VoteOtpNotFound',
    voteOtpRateLimit: 'Error.VoteOtpRateLimit',
    voteIpLimitExceeded: 'Error.VoteIpLimitExceeded',
    surveyDataImportNotAllowed: 'Error.SurveyDataImportNotAllowed',
    rankingFinalizeNotAllowed: 'Error.RankingFinalizeNotAllowed',
    votingConfigNotFound: 'Error.VotingConfigNotFound',
    tooManySeriesSelected: 'Error.TooManySeriesSelected',
    duplicateSeriesInVote: 'Error.DuplicateSeriesInVote',
    seriesNotVotable: 'Error.SeriesNotVotable',
    captchaRejected: 'Error.CaptchaRejected',
    rankingAccessDenied: 'Error.RankingAccessDenied',
    seriesNotFoundForRanking: 'Error.SeriesNotFound'
  },
  errorText: {
    'Error.SurveyPeriodNotFound': 'Không tìm thấy kỳ bình chọn',
    'Error.SurveyPeriodNotOpen': 'Kỳ bình chọn hiện chưa mở',
    'Error.SurveyPeriodAlreadyFinalized': 'Kỳ bình chọn đã được chốt',
    'Error.SurveyPeriodNotFinalized': 'Kỳ bình chọn chưa được chốt',
    'Error.ReaderAlreadyVoted': 'Bạn đã bình chọn trong kỳ này',
    'Error.VoteOtpNotFound': 'Không tìm thấy mã OTP bình chọn',
    'Error.VoteOtpRateLimit': 'Bạn thao tác quá nhanh — vui lòng thử lại sau',
    'Error.VoteIpLimitExceeded': 'Thiết bị này đã vượt quá số lượt bình chọn cho phép',
    'Error.SurveyDataImportNotAllowed': 'Không thể nhập dữ liệu ở trạng thái hiện tại',
    'Error.RankingFinalizeNotAllowed': 'Chưa thể chốt xếp hạng ở trạng thái hiện tại',
    'Error.VotingConfigNotFound': 'Không tìm thấy cấu hình bình chọn',
    'Error.TooManySeriesSelected': 'Bạn đã chọn quá số series cho phép',
    'Error.DuplicateSeriesInVote': 'Danh sách bình chọn có series bị trùng',
    'Error.SeriesNotVotable': 'Series này không đủ điều kiện bình chọn',
    'Error.CaptchaRejected': 'Không thể xác minh captcha — vui lòng thử lại',
    'Error.RankingAccessDenied': 'Bạn không có quyền truy cập dữ liệu xếp hạng này',
    'Error.SeriesNotFound': 'Không tìm thấy series'
  }
} as const
