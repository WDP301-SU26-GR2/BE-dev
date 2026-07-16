// Static thresholds NOT in VotingConfig (business constants).
// Per-period reliability threshold (AppConfig.lowVoteReliabilityThreshold) — read from
// AppConfigService at runtime in finalizeRanking (NOT a static constant — changes per admin patch).
// Rate-limit / captcha / maxSeriesPerVote are read from SurveyConfigService (VotingConfig DB).
export const SURVEY_CONFIG = {
  minChaptersForRiskEvaluation: 8, // Requiment Flow 4: series < 8 chương PUBLISHED loại khỏi at-risk.
  voteWeightForFlagged: 0.5 // captchaScore < threshold → phiếu nghi ngờ.
}

// Spec 15.1 hardening: TTL key reservation quota IP theo kỳ (Redis). Key chứa surveyPeriodId nên
// mỗi kỳ là một counter riêng; kỳ vote sống vài tuần → 60 ngày là dư an toàn, hết kỳ key tự bay.
export const VOTE_IP_QUOTA_TTL_SEC = 60 * 86400
