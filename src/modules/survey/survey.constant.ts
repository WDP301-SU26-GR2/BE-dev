// Static thresholds NOT in VotingConfig (business constants).
// Per-period reliability threshold (AppConfig.lowVoteReliabilityThreshold) — read from
// AppConfigService at runtime in finalizeRanking (NOT a static constant — changes per admin patch).
// Rate-limit / captcha / maxSeriesPerVote are read from SurveyConfigService (VotingConfig DB).
export const SURVEY_CONFIG = {
  minChaptersForRiskEvaluation: 8, // Requiment Flow 4: series < 8 chương PUBLISHED loại khỏi at-risk.
  voteWeightForFlagged: 0.5 // captchaScore < threshold → phiếu nghi ngờ.
}
