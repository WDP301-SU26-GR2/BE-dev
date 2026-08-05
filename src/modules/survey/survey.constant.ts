import { SeriesStatus } from '@prisma/client'

// Static thresholds NOT in VotingConfig (business constants).
// Per-period reliability threshold (AppConfig.lowVoteReliabilityThreshold) — read from
// AppConfigService at runtime in finalizeRanking (NOT a static constant — changes per admin patch).
// Rate-limit / captcha / maxSeriesPerVote are read from SurveyConfigService (VotingConfig DB).
export const SURVEY_CONFIG = {
  minChaptersForRiskEvaluation: 8, // Requiment Flow 4: series < 8 chương PUBLISHED loại khỏi at-risk.
  voteWeightForFlagged: 0.5 // captchaScore < threshold → phiếu nghi ngờ.
}

// BR-VOTE-05 (2026-08-05) — trạng thái series được đưa vào `eligibleSeriesIds` của một kỳ bình chọn.
// Bao gồm cả 2 trạng thái kết thúc: series `CANCELLING`/`COMPLETING` vẫn đang ĐĂNG chương kết thúc trên tạp chí
// kỳ đó nên độc giả vẫn bình chọn được (trước đây chỉ nhận `SERIALIZED` ⇒ chúng biến mất khỏi phiếu bầu).
// KHÔNG gồm `HIATUS`: kỳ đó series không có chương mới nên không có gì để bình chọn — đưa vào chỉ tổ kéo nó
// xuống đáy bảng, trái tinh thần Requiment §1.10 ("hiatus không bị ảnh hưởng tiêu cực").
// ⚠ Đây là NGUỒN SỰ THẬT DUY NHẤT: dùng chung cho validate lúc `POST /survey-periods` và cho
// `GET /survey-periods/eligible-series` — hai bên không được lệch.
export const VOTE_ELIGIBLE_SERIES_STATUSES: SeriesStatus[] = [
  SeriesStatus.SERIALIZED,
  SeriesStatus.CANCELLING,
  SeriesStatus.COMPLETING
]

// Spec 15.1 hardening: TTL key reservation quota IP theo kỳ (Redis). Key chứa surveyPeriodId nên
// mỗi kỳ là một counter riêng; kỳ vote sống vài tuần → 60 ngày là dư an toàn, hết kỳ key tự bay.
export const VOTE_IP_QUOTA_TTL_SEC = 60 * 86400
