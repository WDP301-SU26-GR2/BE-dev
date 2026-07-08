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
    rankingFinalized: 'Kết quả xếp hạng kỳ bình chọn đã được tính toán.'
  },
  error: {
    surveyPeriodNotFound: 'Error.SurveyPeriodNotFound',
    surveyPeriodNotOpen: 'Error.SurveyPeriodNotOpen',
    surveyPeriodAlreadyFinalized: 'Error.SurveyPeriodAlreadyFinalized',
    readerAlreadyVoted: 'Error.ReaderAlreadyVoted',
    voteOtpNotFound: 'Error.VoteOtpNotFound',
    voteOtpRateLimit: 'Error.VoteOtpRateLimit',
    surveyDataImportNotAllowed: 'Error.SurveyDataImportNotAllowed',
    rankingFinalizeNotAllowed: 'Error.RankingFinalizeNotAllowed',
    votingConfigNotFound: 'Error.VotingConfigNotFound',
    tooManySeriesSelected: 'Error.TooManySeriesSelected',
    rankingAccessDenied: 'Error.RankingAccessDenied',
    seriesNotFoundForRanking: 'Error.SeriesNotFound'
  }
} as const
