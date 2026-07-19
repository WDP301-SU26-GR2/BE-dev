// Centralized user-facing messages for the series module — single source of truth.
// Plain strings only (no NestJS imports). HTTP mapping (status + path) stays in
// `errors/series.errors.ts`, which references the `error` codes below.
export const SeriesMessages = {
  response: {
    proposalDeleted: 'Đã xoá bản đề xuất',
    seriesReopened: 'Đã mở lại hồ sơ — bạn có thể chỉnh sửa và nộp lại',
    seriesReopenedForReview: 'Đã mở lại vòng chỉnh sửa sau khi hội đồng từ chối'
  },
  // Internal reasons stored on Series.statusHistory (audit trail). Keep English so logs/audits are
  // scannable; user-facing copy lives in `notification` / `response`.
  reason: {
    forceCancelNoEnding: 'Cancelled without ending — mangaka could not deliver'
  },
  // In-app notification content (notification layer).
  notification: {
    seriesMetadataUpdated: (fields: string) => `Đã cập nhật thông tin series: ${fields}`,
    proposalRevision: (round: number, reason: string) => `Bản đề xuất cần chỉnh sửa (vòng ${round}): ${reason}`,
    proposalResubmitted: (round: number) => `Đã nộp lại bản đề xuất (vòng ${round})`,
    proposalApproved: 'Bản đề xuất đã được duyệt',
    proposalRejected: (reason: string) => `Bản đề xuất bị từ chối: ${reason}`,
    seriesReopenedForReview: 'Editor đã mở lại vòng chỉnh sửa sau khi hội đồng từ chối — hãy cập nhật hồ sơ và nộp lại',
    seriesWithdrawnAfterReject: 'Mangaka đã rút series sau khi hội đồng từ chối',
    seriesCancelling: (allowance: number | null) =>
      allowance != null
        ? `Hội đồng đã quyết định huỷ series. Bạn được cấp ${allowance} chương để kết thúc.`
        : 'Hội đồng đã quyết định huỷ series.',
    seriesCompleting: 'Hội đồng đã duyệt kết thúc series.',
    seriesFormatChanged:
      'Hội đồng đã đổi hình thức xuất bản của series. Deadline các chapter đang sản xuất giữ nguyên — hãy đặt deadline cho chapter kế tiếp theo nhịp mới.',
    seriesContinued: 'Hội đồng quyết định giữ series tiếp tục.',
    seriesRejected: 'Hội đồng đã từ chối serial hoá series.',
    seriesHiatusStarted: 'Series đã tạm ngưng (hiatus).',
    seriesResumed: 'Series đã hoạt động trở lại.',
    seriesCancelled: 'Series đã chính thức bị huỷ.',
    seriesCompleted: 'Series đã chính thức hoàn thành.',
    franchiseConsentRequested: 'Có series phái sinh cần bạn đồng ý cho phép thực hiện.',
    franchiseConsentApproved: 'Mangaka gốc đã đồng ý cho series phái sinh.',
    franchiseConsentRejected: 'Mangaka gốc đã từ chối series phái sinh.',
    // PB-06: Mangaka/Editor proposes natural completion (Series stays SERIALIZED/HIATUS, but
    // `completionProposal` set). Counterparty gets a heads-up so they can raise the question to Board.
    completionProposedToEditor: 'Mangaka đề xuất kết thúc series — cần bạn xem xét mở phiên Hội đồng.',
    completionProposedToMangaka: 'Editor đã ghi nhận đề xuất kết thúc series.',
    // PB-06: Series has been HIATUS for > AppConfig.hiatusTooLongDays days — flag for Board triage.
    hiatusTooLong: 'Series đang HIATUS quá lâu — cần Hội đồng bàn hướng xử lý.'
  },
  // Error codes (FE maps these keys to localized text). Consumed by errors/series.errors.ts.
  // Name-related error codes moved to name module (errors/name.errors.ts).
  error: {
    seriesNotFound: 'Error.SeriesNotFound',
    seriesNotEditable: 'Error.SeriesNotEditable',
    seriesMetadataConflict: 'Error.SeriesMetadataConflict',
    notSeriesOwner: 'Error.NotSeriesOwner',
    proposalNotEditable: 'Error.ProposalNotEditable',
    invalidSeriesTransition: 'Error.InvalidSeriesTransition',
    invalidProposalState: 'Error.InvalidProposalState',
    seriesNotReadyToPitch: 'Error.SeriesNotReadyToPitch',
    parentSeriesNotFound: 'Error.ParentSeriesNotFound',
    seriesAccessDenied: 'Error.SeriesAccessDenied',
    seriesAlreadyClaimed: 'Error.SeriesAlreadyClaimed',
    reviewAlreadyStarted: 'Error.ReviewAlreadyStarted',
    notAssignedEditor: 'Error.NotAssignedEditor',
    proposalNotDeletable: 'Error.ProposalNotDeletable',
    seriesNotInEndingState: 'Error.SeriesNotInEndingState',
    seriesNotProposableForCompletion: 'Error.SeriesNotProposableForCompletion',
    seriesNotInCancellingState: 'Error.SeriesNotInCancellingState',
    franchiseConsentRequired: 'Error.FranchiseConsentRequired',
    notOriginalMangaka: 'Error.NotOriginalMangaka',
    notFranchiseConsentTarget: 'Error.NotFranchiseConsentTarget'
  },
  errorText: {
    'Error.SeriesNotFound': 'Không tìm thấy series',
    'Error.SeriesNotEditable': 'Series hiện không thể chỉnh sửa',
    'Error.SeriesMetadataConflict': 'Thông tin series đã thay đổi — vui lòng tải lại và thử lại',
    'Error.NotSeriesOwner': 'Bạn không phải chủ sở hữu series này',
    'Error.ProposalNotEditable': 'Bản đề xuất hiện không thể chỉnh sửa',
    'Error.InvalidSeriesTransition': 'Không thể chuyển series sang trạng thái này',
    'Error.InvalidProposalState': 'Trạng thái bản đề xuất không hợp lệ',
    'Error.SeriesNotReadyToPitch': 'Series chưa sẵn sàng để gửi đề xuất',
    'Error.ParentSeriesNotFound': 'Không tìm thấy series gốc',
    'Error.SeriesAccessDenied': 'Bạn không có quyền truy cập series này',
    'Error.SeriesAlreadyClaimed': 'Series này đã có Editor khác nhận',
    'Error.ReviewAlreadyStarted': 'Quá trình duyệt đã bắt đầu',
    'Error.NotAssignedEditor': 'Bạn không phải Editor được phân công cho series này',
    'Error.ProposalNotDeletable': 'Bản đề xuất hiện không thể xoá',
    'Error.SeriesNotInEndingState': 'Series chưa ở trạng thái kết thúc',
    'Error.SeriesNotProposableForCompletion': 'Series hiện không thể đề xuất hoàn thành',
    'Error.SeriesNotInCancellingState': 'Series chưa ở trạng thái đang huỷ',
    'Error.FranchiseConsentRequired': 'Cần sự đồng ý của Mangaka sở hữu series gốc',
    'Error.NotOriginalMangaka': 'Bạn không phải Mangaka sở hữu series gốc',
    'Error.NotFranchiseConsentTarget': 'Yêu cầu đồng ý này không dành cho bạn'
  }
} as const
