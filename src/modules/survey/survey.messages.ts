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
    rankingAccessDenied: 'Error.RankingAccessDenied',
    seriesNotFoundForRanking: 'Error.SeriesNotFound'
  }
} as const
